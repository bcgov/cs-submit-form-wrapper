import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ensureFreshToken,
  forceRefreshToken,
  setTokenRefresher,
  type RefreshOutcome,
} from '@/src/shared/auth/tokenRefresh';

const token = (value: string): RefreshOutcome => ({ status: 'token', token: value });
const NO_SESSION: RefreshOutcome = { status: 'no-session' };
const UNAVAILABLE: RefreshOutcome = { status: 'unavailable' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('tokenRefresh', () => {
  beforeEach(() => {
    setTokenRefresher(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports unavailable when no refresher is registered', async () => {
    await expect(ensureFreshToken()).resolves.toEqual(UNAVAILABLE);
    await expect(forceRefreshToken()).resolves.toEqual(UNAVAILABLE);
  });

  it('reports unavailable — not no-session — when the refresher throws', async () => {
    setTokenRefresher(() => Promise.reject(new Error('network')));

    await expect(ensureFreshToken()).resolves.toEqual(UNAVAILABLE);
  });

  it('passes through an affirmative no-session verdict', async () => {
    setTokenRefresher(async () => NO_SESSION);

    await expect(ensureFreshToken()).resolves.toEqual(NO_SESSION);
  });

  it('reports unavailable — not no-session — when the refresh never settles', async () => {
    vi.useFakeTimers();
    // keycloak-js has no timeout of its own. Reporting no-session here would sign out a healthy
    // session just because the IdP was slow.
    const refresher = vi.fn().mockReturnValueOnce(new Promise<RefreshOutcome>(() => {}));
    setTokenRefresher(refresher);

    const pending = ensureFreshToken();
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toEqual(UNAVAILABLE);
  });

  it('starts a fresh refresh after one has timed out', async () => {
    vi.useFakeTimers();
    const refresher = vi.fn().mockReturnValueOnce(new Promise<RefreshOutcome>(() => {}));
    setTokenRefresher(refresher);

    const pending = ensureFreshToken();
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;

    refresher.mockResolvedValueOnce(token('recovered'));
    await expect(ensureFreshToken()).resolves.toEqual(token('recovered'));
    expect(refresher).toHaveBeenCalledTimes(2);
  });

  it('collapses concurrent proactive refreshes onto one call', async () => {
    const pending = deferred<RefreshOutcome>();
    const refresher = vi.fn(() => pending.promise);
    setTokenRefresher(refresher);

    const calls = [ensureFreshToken(), ensureFreshToken(), ensureFreshToken()];
    pending.resolve(token('fresh'));

    await expect(Promise.all(calls)).resolves.toEqual([
      token('fresh'),
      token('fresh'),
      token('fresh'),
    ]);
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it('starts a new refresh once the previous one has settled', async () => {
    const refresher = vi.fn().mockResolvedValue(token('fresh'));
    setTokenRefresher(refresher);

    await ensureFreshToken();
    await ensureFreshToken();

    expect(refresher).toHaveBeenCalledTimes(2);
  });

  it('does not let a forced refresh ride on a pending proactive one', async () => {
    const pending = deferred<RefreshOutcome>();
    const refresher = vi.fn((force: boolean) =>
      force ? Promise.resolve(token('forced')) : pending.promise,
    );
    setTokenRefresher(refresher);

    const proactive = ensureFreshToken();
    const forced = forceRefreshToken();
    pending.resolve(token('proactive'));

    await expect(forced).resolves.toEqual(token('forced'));
    await expect(proactive).resolves.toEqual(token('proactive'));
    expect(refresher.mock.calls).toEqual([[false], [true]]);
  });

  it('lets a proactive refresh join a pending forced one', async () => {
    const pending = deferred<RefreshOutcome>();
    const refresher = vi.fn(() => pending.promise);
    setTokenRefresher(refresher);

    const forced = forceRefreshToken();
    const proactive = ensureFreshToken();
    pending.resolve(token('forced'));

    await expect(Promise.all([forced, proactive])).resolves.toEqual([
      token('forced'),
      token('forced'),
    ]);
    expect(refresher).toHaveBeenCalledTimes(1);
  });
});
