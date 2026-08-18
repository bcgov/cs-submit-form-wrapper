import Redis, { type RedisOptions } from 'ioredis';
import type { PluginConfigReader } from '../../../core/config/pluginConfig';
import { parseNumberEnvValue } from '../../../core/config/env';
import { log } from '../../../core/logging';

const DEFAULT_CONNECT_TIMEOUT_MS = 1000;
const DEFAULT_COMMAND_TIMEOUT_MS = 500;

/** Read an optional numeric plugin-config value, falling back when unset. */
export function optionalNumber(config: PluginConfigReader, key: string, fallback: number): number {
  const raw = config.getOptional(key);
  return raw ? parseNumberEnvValue(raw) : fallback;
}

export interface RedisConnection {
  client: Redis;
  /**
   * Resolve once the client is usable, else reject within connectTimeout. Lets a readiness check
   * give an accurate answer at cold-start (the connection is still coming up when startup health
   * runs) without waiting forever during a real outage.
   */
  whenReady: () => Promise<void>;
}

export interface RedisClientOptions {
  /** Label for the healthy<->degraded transition logs and connection errors, e.g. 'cache-redis'. */
  logLabel: string;
  /**
   * ioredis keyPrefix, applied to keys only. Leave unset for pub/sub, whose channel names are not
   * prefixed by this and must be namespaced by the caller instead.
   */
  keyPrefix?: string;
  /** Extra ioredis options, merged last (e.g. a subscriber connection relaxing commandTimeout). */
  extra?: RedisOptions;
}

/**
 * Build a resilient Redis/Valkey client shared by the cache, pub/sub and (later) stream plugins.
 * The offline queue is disabled, retries are capped and connect/command timeouts are bounded, so
 * both a down backend and a connected-but-stalled one (partition/blackhole) fail fast rather than
 * hanging the caller. ioredis emits 'error' on every failed (re)connect; without a listener those
 * go unhandled and can crash the process, so one is attached that logs only on the healthy<->
 * degraded transition to avoid flooding. What to do on failure is the caller's decision (the cache
 * falls through to source, pub/sub drops) — this owns only the connection plumbing.
 */
export function createRedisClient(
  config: PluginConfigReader,
  options: RedisClientOptions,
): RedisConnection {
  const url = config.getRequired('URL');
  const connectTimeout = optionalNumber(config, 'CONNECT_TIMEOUT_MS', DEFAULT_CONNECT_TIMEOUT_MS);
  const commandTimeout = optionalNumber(config, 'COMMAND_TIMEOUT_MS', DEFAULT_COMMAND_TIMEOUT_MS);

  const client = new Redis(url, {
    keyPrefix: options.keyPrefix,
    connectTimeout,
    commandTimeout,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 200, 2000),
    ...options.extra,
  });

  let degraded = false;
  client.on('error', (err: Error) => {
    if (!degraded) {
      degraded = true;
      log.warn({ err: err.message }, `[${options.logLabel}] backend unavailable`);
    }
  });
  client.on('ready', () => {
    if (degraded) {
      degraded = false;
      log.info(`[${options.logLabel}] backend reachable again`);
    }
  });

  const whenReady = (): Promise<void> => {
    if (client.status === 'ready') return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const settle = (err?: Error): void => {
        clearTimeout(timer);
        client.off('ready', onReady);
        client.off('end', onEnd);
        if (err) reject(err);
        else resolve();
      };
      const onReady = (): void => settle();
      const onEnd = (): void => settle(new Error(`[${options.logLabel}] connection closed`));
      const timer = setTimeout(
        () => settle(new Error(`[${options.logLabel}] connect timed out`)),
        connectTimeout,
      );
      client.once('ready', onReady);
      client.once('end', onEnd);
    });
  };

  return { client, whenReady };
}
