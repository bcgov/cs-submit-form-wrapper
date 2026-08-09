import type Redis from 'ioredis';
import type {
  MessageBusAdapter,
  MessageBusPluginDefinition,
  MessageBusReadinessResult,
} from '../../core/integrations/messagebus/MessageBusAdapter';
import type { PluginConfigReader } from '../../core/config/pluginConfig';
import { createRedisClient } from '../shared/redis/redisClient';
import { log } from '../../core/logging';

const CODE = 'messagebus-redis';
const DEFAULT_CHANNEL_PREFIX = 'soba:';

type Handler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * Cross-replica pub/sub backed by Redis/Valkey (at-most-once, fire-and-forget). Two connections: a
 * SUBSCRIBE-mode socket cannot issue PUBLISH, so publisher and subscriber are separate. Neither
 * carries a key prefix — ioredis keyPrefix does not apply to channels — so channels are namespaced
 * explicitly with CHANNEL_PREFIX (default 'soba:'), letting releases share one Valkey without
 * cross-talk. Publish is best-effort: a failure during an outage is dropped (the connection's
 * transition log records the outage). ioredis re-subscribes its known channels after a reconnect,
 * so handlers survive a blip.
 *
 * Returns the clients alongside the adapter so tests can disconnect them; production callers use the
 * plugin definition below, which drops them (the process holds a single memoized adapter).
 */
export function buildRedisMessageBusAdapter(config: PluginConfigReader): {
  adapter: MessageBusAdapter;
  publisher: Redis;
  subscriber: Redis;
} {
  const channelPrefix = config.getOptional('CHANNEL_PREFIX') ?? DEFAULT_CHANNEL_PREFIX;

  const { client: publisher, whenReady: publisherReady } = createRedisClient(config, {
    logLabel: `${CODE}:pub`,
  });
  const { client: subscriber } = createRedisClient(config, {
    logLabel: `${CODE}:sub`,
    // The subscriber overrides the publisher's fail-fast tuning: it must ride out an outage, not
    // drop. enableOfflineQueue + maxRetriesPerRequest: null make a SUBSCRIBE issued before the
    // socket is ready (or while the backend is down) wait for the connection rather than reject —
    // without this, a subscription that fails once never re-establishes (ioredis only auto-
    // resubscribes channels it subscribed to successfully at least once). A long-lived push
    // connection also has no in-flight command, so drop the command timeout.
    extra: { enableOfflineQueue: true, maxRetriesPerRequest: null, commandTimeout: undefined },
  });

  const channelFor = (topic: string): string => `${channelPrefix}${topic}`;
  const handlers = new Map<string, Handler[]>(); // keyed by channel (prefixed)

  const deliver = (channel: string, message: string): void => {
    const list = handlers.get(channel);
    if (!list?.length) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(message) as Record<string, unknown>;
    } catch (err) {
      log.warn({ err, channel }, '[messagebus-redis] dropping unparseable message');
      return;
    }
    for (const handler of [...list]) {
      Promise.resolve()
        .then(() => handler(payload))
        .catch((err) => log.warn({ err, channel }, '[messagebus-redis] subscriber handler failed'));
    }
  };

  subscriber.on('message', deliver);

  const adapter: MessageBusAdapter = {
    async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
      try {
        await publisher.publish(channelFor(topic), JSON.stringify(payload));
      } catch {
        // at-most-once: a failed publish is dropped; the transition log records the outage.
      }
    },

    subscribe(
      topic: string | string[],
      handler: (payload: Record<string, unknown>) => Promise<void>,
    ): () => void {
      const channels = (Array.isArray(topic) ? topic : [topic]).map(channelFor);
      for (const channel of channels) {
        const list = handlers.get(channel) ?? [];
        const firstForChannel = list.length === 0;
        list.push(handler);
        handlers.set(channel, list);
        if (firstForChannel) {
          subscriber
            .subscribe(channel)
            .catch((err) => log.warn({ err, channel }, '[messagebus-redis] subscribe failed'));
        }
      }
      return () => {
        for (const channel of channels) {
          const list = handlers.get(channel) ?? [];
          const idx = list.indexOf(handler);
          if (idx !== -1) list.splice(idx, 1);
          if (list.length === 0) {
            handlers.delete(channel);
            subscriber
              .unsubscribe(channel)
              .catch((err) => log.warn({ err, channel }, '[messagebus-redis] unsubscribe failed'));
          } else {
            handlers.set(channel, list);
          }
        }
      };
    },

    async readinessCheck(): Promise<MessageBusReadinessResult> {
      // Ping the publisher: it proves the backend is reachable. The subscriber shares the same URL,
      // and the self-test verifies the full round-trip (both connections + delivery).
      try {
        await publisherReady();
        await publisher.ping();
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
  };

  return { adapter, publisher, subscriber };
}

export const messagebusPluginDefinition: MessageBusPluginDefinition = {
  code: CODE,
  createAdapter: (config) => buildRedisMessageBusAdapter(config).adapter,
};
