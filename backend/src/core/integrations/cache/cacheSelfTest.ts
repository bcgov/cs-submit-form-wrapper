import { v7 as uuidv7 } from 'uuid';
import type { CacheAdapter } from './CacheAdapter';

const PROBE = 'soba-cache-self-test';

export interface CacheSelfTestResult {
  /** Wrote a probe, read it back identical, and removed it. */
  roundTrip: boolean;
  message?: string;
}

/**
 * Confirm the cache actually stores and returns values, not just that it is reachable. Checks
 * readiness first (warms a cold-start connection and yields a reason on a real outage, since the
 * adapter's data ops are best-effort and swallow errors), then writes a probe, reads it back,
 * verifies, and removes it. Never throws; failure -> roundTrip: false.
 */
export async function cacheSelfTest(adapter: CacheAdapter): Promise<CacheSelfTestResult> {
  const readiness = (await adapter.readinessCheck?.()) ?? { ok: true };
  if (!readiness.ok) {
    return { roundTrip: false, message: readiness.message };
  }

  const key = `__cache_selftest__:${uuidv7()}`;
  const value = { probe: PROBE, at: key };
  try {
    await adapter.set(key, value, 10_000);
    const readBack = await adapter.get<typeof value>(key);
    return { roundTrip: readBack?.probe === value.probe && readBack?.at === value.at };
  } finally {
    await adapter.delete(key).catch(() => undefined);
  }
}
