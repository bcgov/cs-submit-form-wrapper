import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sobaFetch, SessionExpiredError } from '@/src/shared/api/sobaFetch';
import { setTokenRefresher, type RefreshOutcome } from '@/src/shared/auth/tokenRefresh';

const token = (value: string): RefreshOutcome => ({ status: 'token', token: value });

function mockResponse(status = 200) {
  return {
    ok: status < 400,
    status,
    headers: {
      get: () => null,
    },
    json: async () => ({}),
  } as unknown as Response;
}

const authHeader = (call: unknown[]) =>
  (call[1] as { headers: Record<string, string> }).headers.Authorization;

describe('sobaFetch', () => {
  beforeEach(() => {
    setTokenRefresher(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends Authorization and a workspaceId query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse());
    vi.stubGlobal('fetch', fetchMock);

    await sobaFetch('/forms', { token: 'tok', query: { workspaceId: 'wsX' } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/forms?workspaceId=wsX');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers.Accept).toBe('application/json');
  });

  it('serializes a JSON body with a Content-Type header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse());
    vi.stubGlobal('fetch', fetchMock);

    await sobaFetch('/forms', {
      token: 'tok',
      method: 'POST',
      json: { a: 1 },
      query: { workspaceId: 'wsX' },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('sends the refreshed token, not the one the caller passed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse());
    vi.stubGlobal('fetch', fetchMock);
    setTokenRefresher(async () => token('fresh'));

    await sobaFetch('/forms', { token: 'stale' });

    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer fresh');
  });

  it('refuses to send when a registered refresher reports no session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse());
    vi.stubGlobal('fetch', fetchMock);
    setTokenRefresher(async () => ({ status: 'no-session' }));

    // Sending the stale token would be accepted as anonymous on the submit surface and file the
    // caller's work as the public user.
    await expect(
      sobaFetch('/submit/submissions', { token: 'stale', method: 'POST' }),
    ).rejects.toThrow(SessionExpiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the caller token when the refresh reached no verdict', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse());
    vi.stubGlobal('fetch', fetchMock);
    // A slow or failed refresh is not evidence the session ended; failing the call here would sign
    // people out of healthy sessions.
    setTokenRefresher(async () => ({ status: 'unavailable' }));

    await sobaFetch('/forms', { token: 'caller' });

    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer caller');
  });

  it('uses the caller token when no refresher is registered', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse());
    vi.stubGlobal('fetch', fetchMock);

    await sobaFetch('/forms', { token: 'caller' });

    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer caller');
  });

  it('never refreshes for an anonymous call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse());
    vi.stubGlobal('fetch', fetchMock);
    const refresher = vi.fn().mockResolvedValue(token('fresh'));
    setTokenRefresher(refresher);

    await sobaFetch('/submit/submissions/abc/fill');

    expect(refresher).not.toHaveBeenCalled();
    expect(authHeader(fetchMock.mock.calls[0])).toBeUndefined();
  });

  it('forces a refresh on a 401 and replays the request once', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(401))
      .mockResolvedValueOnce(mockResponse());
    vi.stubGlobal('fetch', fetchMock);
    const refresher = vi
      .fn()
      .mockResolvedValueOnce(token('first'))
      .mockResolvedValueOnce(token('second'));
    setTokenRefresher(refresher);

    const response = await sobaFetch('/forms', { token: 'stale', method: 'POST', json: { a: 1 } });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresher.mock.calls).toEqual([[false], [true]]);
    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer first');
    expect(authHeader(fetchMock.mock.calls[1])).toBe('Bearer second');
    // The replay carries the same body, not a consumed one.
    expect((fetchMock.mock.calls[1][1] as { body: string }).body).toBe(JSON.stringify({ a: 1 }));
  });

  // A permission refusal is a 403. A 401 the refresh cannot get past is the session being refused,
  // and reporting it as one is what lets a caller tell "sign in again" from "you do not have
  // access" rather than showing a generic failure.
  it('reports an ended session when the forced refresh yields the same token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(401));
    vi.stubGlobal('fetch', fetchMock);
    setTokenRefresher(async () => token('same'));

    await expect(sobaFetch('/forms', { token: 'same' })).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not replay an anonymous 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(401));
    vi.stubGlobal('fetch', fetchMock);
    const refresher = vi.fn().mockResolvedValue(token('fresh'));
    setTokenRefresher(refresher);

    await sobaFetch('/submit/submissions/abc/fill');

    expect(refresher).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replays at most once, then reports an ended session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(401));
    vi.stubGlobal('fetch', fetchMock);
    const refresher = vi
      .fn()
      .mockResolvedValueOnce(token('first'))
      .mockResolvedValueOnce(token('second'))
      .mockResolvedValue(token('third'));
    setTokenRefresher(refresher);

    await expect(sobaFetch('/forms', { token: 'stale' })).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one refresh across concurrent calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse());
    vi.stubGlobal('fetch', fetchMock);
    const refresher = vi.fn().mockResolvedValue(token('fresh'));
    setTokenRefresher(refresher);

    await Promise.all([
      sobaFetch('/forms', { token: 'stale' }),
      sobaFetch('/workspaces', { token: 'stale' }),
      sobaFetch('/me', { token: 'stale' }),
    ]);

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
