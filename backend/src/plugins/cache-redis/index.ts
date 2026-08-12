import Redis from 'ioredis';
import type {
  CacheAdapter,
  CacheReadinessResult,
  CachePluginDefinition,
} from '../../core/integrations/cache/CacheAdapter';
import type { PluginConfigReader } from '../../core/config/pluginConfig';
import { parseNumberEnvValue } from '../../core/config/env';
import { log } from '../../core/logging';

const CODE = 'cache-redis';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes; same as cache-memory
const DEFAULT_KEY_PREFIX = 'soba:';
const DEFAULT_CONNECT_TIMEOUT_MS = 1000;
const DEFAULT_COMMAND_TIMEOUT_MS = 500;

function optionalNumber(config: PluginConfigReader, key: string, fallback: number): number {
  const raw = config.getOptional(key);
  return raw ? parseNumberEnvValue(raw) : fallback;
}

/**
 * Shared cache backed by Redis/Valkey. Every operation is best-effort: on any backend error the
 * adapter falls through to the source of truth (get -> null, getOrSet -> factory) rather than
 * throwing, so a cache outage is slower, not an outage. The offline queue is disabled, retries are
 * capped, and a commandTimeout bounds each command — so both a down backend and a connected-but-
 * stalled one (partition/blackhole) fail fast to the source rather than hanging the request. The
 * cost is a brief window right after startup, before the connection is ready, where lookups bypass
 * the cache and hit the source directly — the cache warms once connected.
 *
 * Returns the client alongside the adapter so tests can disconnect it; production callers use the
 * plugin definition below, which drops the client (the process holds a single memoized adapter).
 */
export function buildRedisCacheAdapter(config: PluginConfigReader): {
  adapter: CacheAdapter;
  client: Redis;
} {
  const url = config.getRequired('URL');
  const keyPrefix = config.getOptional('KEY_PREFIX') ?? DEFAULT_KEY_PREFIX;
  const defaultTtlMs = optionalNumber(config, 'DEFAULT_TTL_MS', DEFAULT_TTL_MS);
  const connectTimeout = optionalNumber(config, 'CONNECT_TIMEOUT_MS', DEFAULT_CONNECT_TIMEOUT_MS);
  const commandTimeout = optionalNumber(config, 'COMMAND_TIMEOUT_MS', DEFAULT_COMMAND_TIMEOUT_MS);

  const client = new Redis(url, {
    keyPrefix,
    connectTimeout,
    commandTimeout,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  // ioredis emits 'error' on every failed (re)connect; without a listener these become unhandled
  // and can crash the process. Log only on the healthy<->degraded transition to avoid flooding.
  let degraded = false;
  client.on('error', (err: Error) => {
    if (!degraded) {
      degraded = true;
      log.warn(
        { err: err.message },
        '[cache-redis] cache backend unavailable; falling through to source of truth',
      );
    }
  });
  client.on('ready', () => {
    if (degraded) {
      degraded = false;
      log.info('[cache-redis] cache backend reachable again');
    }
  });

  // Resolve once the client is usable, else reject within connectTimeout. Lets readinessCheck give
  // an accurate answer at cold-start (the connection is still coming up when startup health runs)
  // without waiting forever during a real outage.
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
      const onEnd = (): void => settle(new Error('cache connection closed'));
      const timer = setTimeout(() => settle(new Error('cache connect timed out')), connectTimeout);
      client.once('ready', onReady);
      client.once('end', onEnd);
    });
  };

  const write = async (key: string, value: unknown, ttlMs?: number): Promise<void> => {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return; // nothing to cache (undefined/function/symbol)
    try {
      await client.set(key, serialized, 'PX', ttlMs ?? defaultTtlMs);
    } catch {
      // best-effort: a failed write just means a future miss
    }
  };

  const adapter: CacheAdapter = {
    async get<T>(key: string): Promise<T | null> {
      try {
        const raw = await client.get(key);
        return raw === null ? null : (JSON.parse(raw) as T);
      } catch {
        return null; // treat any cache error as a miss
      }
    },

    set(key: string, value: unknown, ttlMs?: number): Promise<void> {
      return write(key, value, ttlMs);
    },

    async delete(key: string): Promise<void> {
      try {
        await client.del(key);
      } catch {
        // best-effort: invalidation reaches every pod via the shared store when it recovers
      }
    },

    async getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T> {
      try {
        const raw = await client.get(key);
        if (raw !== null) return JSON.parse(raw) as T;
      } catch {
        // fall through to the source of truth on any cache error
      }
      const value = await factory();
      await write(key, value, ttlMs);
      return value;
    },

    async readinessCheck(): Promise<CacheReadinessResult> {
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

export const cachePluginDefinition: CachePluginDefinition = {
  code: CODE,
  createAdapter: (config) => buildRedisCacheAdapter(config).adapter,
};
