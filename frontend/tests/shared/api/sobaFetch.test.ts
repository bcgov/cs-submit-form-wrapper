import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sobaFetch, SessionExpiredError } from '@/src/shared/api/sobaFetch';
import {
  getWorkspaceId,
  setWorkspaceId,
  clearWorkspaceId,
} from '@/src/shared/workspace/workspaceStore';
import { setWorkspaceResolvedListener } from '@/src/shared/workspace/workspaceSync';
import { setTokenRefresher, type RefreshOutcome } from '@/src/shared/auth/tokenRefresh';

const token = (value: string): RefreshOutcome => ({ status: 'token', token: value });

function mockResponse(workspaceHeader: string | null, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === 'x-soba-workspace-id' ? workspaceHeader : null,
    },
    json: async () => ({}),
  } as unknown as Response;
}

const authHeader = (call: unknown[]) =>
  (call[1] as { headers: Record<string, string> }).headers.Authorization;

describe('sobaFetch', () => {
  beforeEach(() => {
    clearWorkspaceId();
    setWorkspaceResolvedListener(null);
    setTokenRefresher(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends Authorization and a workspaceId query param, never a workspace request header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(null));
    vi.stubGlobal('fetch', fetchMock);

    await sobaFetch('/forms', { token: 'tok', workspaceId: 'wsX' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/forms?workspaceId=wsX');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers.Accept).toBe('application/json');
    expect(Object.keys(init.headers)).not.toContain('x-soba-workspace-id');
  });

  it('captures the echoed x-soba-workspace-id header into the store and notifies listeners', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse('wsEcho'));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    setWorkspaceResolvedListener((id) => seen.push(id));

    await sobaFetch('/forms/abc', { token: 'tok' });

    expect(getWorkspaceId()).toBe('wsEcho');
    expect(seen).toEqual(['wsEcho']);
  });

  it('does not re-notify when the echoed workspace already matches the store', async () => {
    setWorkspaceId('wsSame');
    const fetchMock = vi.fn().mockResolvedValue(mockResponse('wsSame'));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    setWorkspaceResolvedListener((id) => seen.push(id));

    await sobaFetch('/forms/abc', { token: 'tok' });

    expect(seen).toEqual([]);
  });

  it('serializes a JSON body with a Content-Type header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(null));
    vi.stubGlobal('fetch', fetchMock);

    await sobaFetch('/forms', { token: 'tok', method: 'POST', json: { a: 1 }, workspaceId: 'wsX' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('sends the refreshed token, not the one the caller passed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(null));
    vi.stubGlobal('fetch', fetchMock);
    setTokenRefresher(async () => token('fresh'));

    await sobaFetch('/forms', { token: 'stale' });

    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer fresh');
  });

  it('refuses to send when a registered refresher reports no session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(null));
    vi.stubGlobal('fetch', fetchMock);
    setTokenRefresher(async () => ({ status: 'no-session' }));

    // Sending the stale token would be accepted as anonymous on the submit surface and file the
    // caller's work as the public user.
    await expect(sobaFetch('/submit/submissions', { token: 'stale', method: 'POST' })).rejects.toThrow(
      SessionExpiredError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the caller token when the refresh reached no verdict', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(null));
    vi.stubGlobal('fetch', fetchMock);
    // A slow or failed refresh is not evidence the session ended; failing the call here would sign
    // people out of healthy sessions.
    setTokenRefresher(async () => ({ status: 'unavailable' }));

    await sobaFetch('/forms', { token: 'caller' });

    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer caller');
  });

  it('uses the caller token when no refresher is registered', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(null));
    vi.stubGlobal('fetch', fetchMock);

    await sobaFetch('/forms', { token: 'caller' });

    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer caller');
  });

  it('never refreshes for an anonymous call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(null));
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
      .mockResolvedValueOnce(mockResponse(null, 401))
      .mockResolvedValueOnce(mockResponse(null));
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

  it('returns the 401 without replaying when the forced refresh yields the same token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(null, 401));
    vi.stubGlobal('fetch', fetchMock);
    setTokenRefresher(async () => token('same'));

    const response = await sobaFetch('/forms', { token: 'same' });

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not replay an anonymous 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(null, 401));
    vi.stubGlobal('fetch', fetchMock);
    const refresher = vi.fn().mockResolvedValue(token('fresh'));
    setTokenRefresher(refresher);

    await sobaFetch('/submit/submissions/abc/fill');

    expect(refresher).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replays at most once when the 401 persists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(null, 401));
    vi.stubGlobal('fetch', fetchMock);
    const refresher = vi
      .fn()
      .mockResolvedValueOnce(token('first'))
      .mockResolvedValueOnce(token('second'))
      .mockResolvedValue(token('third'));
    setTokenRefresher(refresher);

    const response = await sobaFetch('/forms', { token: 'stale' });

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one refresh across concurrent calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(null));
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
