import { describe, it, expect, vi, afterEach } from 'vitest';
import { sobaFetch } from '@/src/shared/api/sobaFetch';

function mockResponse() {
  return {
    ok: true,
    status: 200,
    headers: {
      get: () => null,
    },
    json: async () => ({}),
  } as unknown as Response;
}

describe('sobaFetch', () => {
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

    await sobaFetch('/forms', { token: 'tok', method: 'POST', json: { a: 1 }, query: {workspaceId: 'wsX'} });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });
});
