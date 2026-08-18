/**
 * Pluggable cache adapter interface. Implementations are provided by plugins
 * (e.g. cache-memory, cache-redis) and selected via CACHE_DEFAULT_CODE.
 */
import type { PluginConfigReader } from '../../config/pluginConfig';

/** Result of a cache readiness check; exposes no config or credentials. */
export interface CacheReadinessResult {
  ok: boolean;
  message?: string;
}

/**
 * Cached values must be JSON-plain: remote backends (cache-redis) JSON round-trip them, so Dates
 * come back as ISO strings, `undefined` is dropped, and class instances lose their prototype. Cache
 * only data whose JSON form is what callers read (the in-memory adapter keeps references, so relying
 * on non-JSON types works there but silently differs in production).
 */
export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  getOrSet?<T>(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T>;
  /** Optional: report whether the backend is reachable (readiness). No config in the result. */
  readinessCheck?(): Promise<CacheReadinessResult>;
}

export interface CachePluginDefinition {
  code: string;
  createAdapter: (config: PluginConfigReader) => CacheAdapter;
}
