import type Redis from 'ioredis';
import type {
  EventEnvelope,
  EventStreamAdapter,
  EventStreamConfig,
  EventStreamPluginDefinition,
  EventStreamReadinessResult,
  EventStreamSubscription,
} from '../../core/integrations/eventstream/EventStreamAdapter';
import type { PluginConfigReader } from '../../core/config/pluginConfig';
import { resolveStreamRetention } from '../../core/integrations/eventstream/streamRetention';
import { createRedisClient, optionalNumber } from '../shared/redis/redisClient';
import { log } from '../../core/logging';

const CODE = 'eventstream-redis';
const DATA_FIELD = 'data';
const DEFAULT_STREAM_PREFIX = 'soba:';
const BATCH = 10;
const DEFAULT_MAX_DELIVERIES = 5;
const DEFAULT_MIN_IDLE_MS = 30_000; // a pending message must be idle this long before it is reclaimed
const DEFAULT_BLOCK_MS = 5_000; // XREADGROUP BLOCK window

type StreamEntry = [id: string, fields: string[]];
type PendingEntry = [id: string, consumer: string, idleMs: number, deliveryCount: number];

/** Parse the single JSON `data` field written by append back into an event envelope. */
export function parseEnvelope(fields: string[]): EventEnvelope {
  for (let i = 0; i + 1 < fields.length; i += 2) {
    if (fields[i] === DATA_FIELD) {
      try {
        const parsed = JSON.parse(fields[i + 1]) as Partial<EventEnvelope>;
        return {
          type: parsed.type ?? 'unknown',
          data: parsed.data ?? {},
          id: parsed.id,
          time: parsed.time,
        };
      } catch {
        return { type: 'unknown', data: {} };
      }
    }
  }
  return { type: 'unknown', data: {} };
}

/**
 * XADD trim arguments for a stream's retention: an approximate cap (`MAXLEN ~ N`) when one is
 * declared, otherwise none. Approximate because Redis only removes whole macro nodes, so the stream
 * settles within stream-node-max-entries of N rather than exactly at it; an exact `MAXLEN` costs
 * more per append for a precision retention does not need. Only maxLen is applied — an age bound
 * needs a separate XTRIM.
 */
export function trimArgs(retention: EventStreamConfig | undefined): (string | number)[] {
  return retention?.maxLen ? ['MAXLEN', '~', retention.maxLen] : [];
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
 * Redis has no server-side retention, so a declared cap is emulated by trimming on append. The cap
 * comes from the shared declarations (streamRetention.ts), which every replica resolves the same
 * way, so it does not matter which pod appends. Only maxLen is applied: XADD takes a single trim
 * strategy, and an age bound also needs a periodic XTRIM to catch a stream that has gone quiet.
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

  // Resolved from the shared declarations once per stream per process: the cap follows the stream,
  // so every replica trims it the same way whether or not it provisioned it. Durability is a
  // deployment/persistence concern.
  const retentionCache = new Map<string, EventStreamConfig | undefined>();
  const retentionFor = (stream: string): EventStreamConfig | undefined => {
    if (retentionCache.has(stream)) return retentionCache.get(stream);
    const retention = resolveStreamRetention(stream);
    if (retention?.maxAgeMs !== undefined) {
      // Not implemented. MINID trims by age on append (ids are ms timestamps), but XADD carries one
      // strategy, so a stream with both limits needs a separate XTRIM — which append-time trimming
      // would need anyway, since it never fires on a stream that has gone quiet.
      log.warn(
        { stream, maxAgeMs: retention.maxAgeMs },
        `[${CODE}] maxAgeMs is declared but not applied; only maxLen is trimmed`,
      );
    }
    retentionCache.set(stream, retention);
    return retention;
  };

  // Every stream key is namespaced so releases sharing one Valkey (e.g. PRs in the dev namespace)
  // never read each other's events or share consumer groups. keyPrefix does not apply to the .call()
  // command args, so the prefix is applied explicitly. Callers use logical names; Redis sees keyed.
  const streamPrefix = config.getOptional('STREAM_PREFIX') ?? DEFAULT_STREAM_PREFIX;
  const streamKey = (name: string): string => `${streamPrefix}${name}`;

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
      const event = entries?.[0] ? parseEnvelope(entries[0][1]) : { type: 'unknown', data: {} };
      await client.call(
        'XADD',
        `${stream}:dead`,
        '*',
        DATA_FIELD,
        JSON.stringify({ id, group, event }),
      );
      // Ack only after the dead-letter is safely written. If the XADD failed we must NOT ack, or the
      // message is lost — leave it pending so the next reclaim cycle retries the dead-letter.
      await client.call('XACK', stream, group, id);
    } catch (err) {
      log.warn(
        { err, stream, group, id },
        `[${CODE}] dead-letter failed; leaving pending for retry`,
      );
    }
  };

  const adapter: EventStreamAdapter = {
    async ensureStream(stream: string): Promise<void> {
      // Redis auto-creates a stream on first append (and consume passes MKSTREAM), so there is
      // nothing to provision. Resolve retention now so a bad override or an unapplied maxAgeMs is
      // logged at wiring time rather than on the first append.
      retentionFor(stream);
    },

    async append(stream: string, event: EventEnvelope): Promise<{ id: string }> {
      // Wait for the connection so a cold-start append doesn't fail on the empty offline queue;
      // whenReady is bounded by connectTimeout, so a real outage still fails loud (at-least-once).
      await whenReady();
      const data = JSON.stringify({ ...event, time: event.time ?? new Date().toISOString() });
      const key = streamKey(stream);
      // Trim only when the stream is declared with a cap — no default, so an undeclared stream never
      // silently drops un-acked entries (at-least-once).
      const id = (await client.call(
        'XADD',
        key,
        ...trimArgs(retentionFor(stream)),
        '*',
        DATA_FIELD,
        data,
      )) as string | null;
      if (!id) throw new Error(`[${CODE}] XADD returned no id for stream '${stream}'`);
      return { id };
    },

    async consume(stream, group, consumer, handler, options): Promise<EventStreamSubscription> {
      const maxDeliveries = options?.maxDeliveries ?? defaultMaxDeliveries;
      const key = streamKey(stream);
      // Wait for the connection before creating the group so a consumer wired at startup rides out
      // the cold-start window; whenReady is bounded, so a real outage still fails loud below.
      await whenReady();
      // Fail loud if the group can't be created (e.g. backend down) — the caller learns the
      // consumer didn't start, rather than a loop silently spinning.
      await ensureGroup(key, group, options?.from ?? 'new');
      const reader = makeReader();
      let stopped = false;

      const process = async (id: string, fields: string[], attempt: number): Promise<void> => {
        try {
          await handler({ id, attempt, event: parseEnvelope(fields) });
        } catch (err) {
          // Leave un-acked; reclaimPending redelivers after MIN_IDLE_MS or dead-letters past the cap.
          log.warn({ err, stream, group, id, attempt }, `[${CODE}] handler failed; will redeliver`);
          return;
        }
        try {
          await client.call('XACK', key, group, id);
        } catch (err) {
          // Handler succeeded but the ack didn't land — the message stays pending and may be
          // redelivered (at-least-once tolerates the duplicate); log it as an ack failure, not a
          // handler failure, so it isn't mistaken for a broken handler or dead-lettered as poison.
          log.warn({ err, stream, group, id }, `[${CODE}] ack failed after successful handling`);
        }
      };

      const reclaimPending = async (): Promise<void> => {
        const pend = (await client.call(
          'XPENDING',
          key,
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
            await deadLetter(key, group, id);
            continue;
          }
          const claimed = (await client.call('XCLAIM', key, group, consumer, minIdleMs, id)) as
            | StreamEntry[]
            | null;
          if (claimed?.[0]) await process(id, claimed[0][1], Number(deliveryCount) + 1);
        }
      };

      const readNew = async (): Promise<void> => {
        if (stopped) return;
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
          key,
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
            // The group/stream can vanish under us (backend restart without persistence, or an
            // explicit delete). Recreate it and carry on rather than spinning on NOGROUP forever.
            if (err instanceof Error && err.message.includes('NOGROUP')) {
              log.warn({ stream, group }, `[${CODE}] consumer group missing; recreating`);
              await ensureGroup(key, group, options?.from ?? 'new').catch(() => undefined);
              continue;
            }
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

    async deleteStream(stream: string): Promise<void> {
      const key = streamKey(stream);
      await client.call('DEL', key, `${key}:dead`);
    },
  };

  return { adapter, client };
}

export const eventStreamPluginDefinition: EventStreamPluginDefinition = {
  code: CODE,
  createAdapter: (config) => buildRedisEventStreamAdapter(config).adapter,
};
