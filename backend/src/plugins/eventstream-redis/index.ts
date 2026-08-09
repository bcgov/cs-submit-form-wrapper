import type Redis from 'ioredis';
import type {
  EventStreamAdapter,
  EventStreamPluginDefinition,
  EventStreamReadinessResult,
  EventStreamSubscription,
} from '../../core/integrations/eventstream/EventStreamAdapter';
import type { PluginConfigReader } from '../../core/config/pluginConfig';
import { createRedisClient, optionalNumber } from '../shared/redis/redisClient';
import { log } from '../../core/logging';

const CODE = 'eventstream-redis';
const DATA_FIELD = 'data';
const BATCH = 10;
const DEFAULT_MAX_DELIVERIES = 5;
const DEFAULT_MIN_IDLE_MS = 30_000; // a pending message must be idle this long before it is reclaimed
const DEFAULT_BLOCK_MS = 5_000; // XREADGROUP BLOCK window

type StreamEntry = [id: string, fields: string[]];
type PendingEntry = [id: string, consumer: string, idleMs: number, deliveryCount: number];

/** Parse the single JSON `data` field written by append back into a payload. */
export function parsePayload(fields: string[]): Record<string, unknown> {
  for (let i = 0; i + 1 < fields.length; i += 2) {
    if (fields[i] === DATA_FIELD) {
      try {
        return JSON.parse(fields[i + 1]) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
  }
  return {};
}

/**
 * Flatten an XREADGROUP reply into its stream entries, tolerant of both wire protocols. ioredis
 * defaults to RESP3, where the per-stream map comes back flattened as [name, entries, name, entries];
 * under RESP2 it is the nested [[name, entries], ...]. We only ever read one stream, so either way we
 * just want every [id, fields] entry.
 */
export function extractEntries(reply: unknown): StreamEntry[] {
  if (!Array.isArray(reply) || reply.length === 0) return [];
  const out: StreamEntry[] = [];
  if (typeof reply[0] === 'string') {
    for (let i = 1; i < reply.length; i += 2) {
      if (Array.isArray(reply[i])) out.push(...(reply[i] as StreamEntry[]));
    }
  } else {
    for (const pair of reply as [string, StreamEntry[]][]) {
      if (Array.isArray(pair?.[1])) out.push(...pair[1]);
    }
  }
  return out;
}

/**
 * Durable event stream backed by Redis Streams (at-least-once, consumer groups, replay). Two kinds
 * of connection off the shared client: one command connection (XADD/XACK/XCLAIM/XPENDING) and, per
 * consume(), a dedicated blocking reader (XREADGROUP BLOCK monopolises its socket). append is
 * fail-loud — it throws on failure rather than dropping, because delivery is at-least-once (a
 * transactional outbox can wrap it later for guaranteed delivery across an outage). A handler that
 * throws leaves the message un-acked in the group's pending list (PEL); the loop reclaims idle
 * pending messages after MIN_IDLE_MS and redelivers them, dead-lettering to <stream>:dead once a
 * message has been delivered MAX_DELIVERIES times.
 *
 * Returns the command client alongside the adapter so tests can disconnect it; production callers use
 * the plugin definition below, which drops it.
 */
export function buildRedisEventStreamAdapter(config: PluginConfigReader): {
  adapter: EventStreamAdapter;
  client: Redis;
} {
  const defaultMaxDeliveries = optionalNumber(config, 'MAX_DELIVERIES', DEFAULT_MAX_DELIVERIES);
  const minIdleMs = optionalNumber(config, 'MIN_IDLE_MS', DEFAULT_MIN_IDLE_MS);
  const blockMs = optionalNumber(config, 'BLOCK_MS', DEFAULT_BLOCK_MS);

  const { client, whenReady } = createRedisClient(config, { logLabel: `${CODE}:cmd` });

  // Each consumer gets its own reader: a blocking XREADGROUP ties up the connection. It must ride
  // out reconnects (queue + no per-request cap) and not be killed by the command timeout while it
  // blocks, so those are relaxed here via the shared client's escape hatch.
  const makeReader = (): Redis =>
    createRedisClient(config, {
      logLabel: `${CODE}:reader`,
      extra: { enableOfflineQueue: true, maxRetriesPerRequest: null, commandTimeout: undefined },
    }).client;

  const ensureGroup = async (
    stream: string,
    group: string,
    from: 'beginning' | 'new',
  ): Promise<void> => {
    const start = from === 'beginning' ? '0' : '$';
    try {
      await client.call('XGROUP', 'CREATE', stream, group, start, 'MKSTREAM');
    } catch (err) {
      // BUSYGROUP just means the group already exists; anything else is a real failure.
      if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err;
    }
  };

  const deadLetter = async (stream: string, group: string, id: string): Promise<void> => {
    try {
      const entries = (await client.call('XRANGE', stream, id, id)) as StreamEntry[] | null;
      const payload = entries?.[0] ? parsePayload(entries[0][1]) : {};
      await client.call(
        'XADD',
        `${stream}:dead`,
        '*',
        DATA_FIELD,
        JSON.stringify({ id, group, payload }),
      );
    } catch (err) {
      log.warn({ err, stream, group, id }, `[${CODE}] dead-letter write failed`);
    } finally {
      await client.call('XACK', stream, group, id).catch(() => undefined);
    }
  };

  const adapter: EventStreamAdapter = {
    async append(stream: string, payload: Record<string, unknown>): Promise<{ id: string }> {
      const id = (await client.call('XADD', stream, '*', DATA_FIELD, JSON.stringify(payload))) as
        | string
        | null;
      if (!id) throw new Error(`[${CODE}] XADD returned no id for stream '${stream}'`);
      return { id };
    },

    async consume(stream, group, consumer, handler, options): Promise<EventStreamSubscription> {
      const maxDeliveries = options?.maxDeliveries ?? defaultMaxDeliveries;
      // Fail loud if the group can't be created (e.g. backend down) — the caller learns the
      // consumer didn't start, rather than a loop silently spinning.
      await ensureGroup(stream, group, options?.from ?? 'new');
      const reader = makeReader();
      let stopped = false;

      const process = async (id: string, fields: string[], attempt: number): Promise<void> => {
        try {
          await handler({ id, payload: parsePayload(fields), attempt });
          await client.call('XACK', stream, group, id);
        } catch (err) {
          // Leave un-acked; reclaimPending redelivers after MIN_IDLE_MS or dead-letters past the cap.
          log.warn({ err, stream, group, id, attempt }, `[${CODE}] handler failed; will redeliver`);
        }
      };

      const reclaimPending = async (): Promise<void> => {
        const pend = (await client.call(
          'XPENDING',
          stream,
          group,
          'IDLE',
          minIdleMs,
          '-',
          '+',
          BATCH,
        )) as PendingEntry[] | null;
        if (!Array.isArray(pend)) return;
        for (const [id, , , deliveryCount] of pend) {
          if (stopped) return;
          if (Number(deliveryCount) >= maxDeliveries) {
            await deadLetter(stream, group, id);
            continue;
          }
          const claimed = (await client.call('XCLAIM', stream, group, consumer, minIdleMs, id)) as
            | StreamEntry[]
            | null;
          if (claimed?.[0]) await process(id, claimed[0][1], Number(deliveryCount) + 1);
        }
      };

      const readNew = async (): Promise<void> => {
        const reply = await reader.call(
          'XREADGROUP',
          'GROUP',
          group,
          consumer,
          'COUNT',
          BATCH,
          'BLOCK',
          blockMs,
          'STREAMS',
          stream,
          '>',
        );
        for (const [id, fields] of extractEntries(reply)) {
          if (stopped) return;
          await process(id, fields, 1);
        }
      };

      const loop = async (): Promise<void> => {
        while (!stopped) {
          try {
            await reclaimPending();
            await readNew();
          } catch (err) {
            if (stopped) break;
            log.warn({ err, stream, group }, `[${CODE}] consume loop error; retrying`);
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      };

      void loop();

      return async () => {
        stopped = true;
        reader.disconnect(); // interrupt the blocking XREADGROUP
      };
    },

    async readinessCheck(): Promise<EventStreamReadinessResult> {
      try {
        await whenReady();
        await client.ping();
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
  };

  return { adapter, client };
}

export const eventStreamPluginDefinition: EventStreamPluginDefinition = {
  code: CODE,
  createAdapter: (config) => buildRedisEventStreamAdapter(config).adapter,
};
