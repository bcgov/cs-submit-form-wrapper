import { describe, it, expect, vi, afterEach } from 'vitest';
import { selectWorkspace } from '@/src/shared/api/sobaApi';

function mockResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      id: 'w1',
      name: 'WS',
      kind: 'personal',
      role: 'owner',
      status: 'active',
    }),
  } as unknown as Response;
}

describe('selectWorkspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs /workspaces/:id with the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await selectWorkspace('tok', 'w1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/workspaces/w1');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(result.id).toBe('w1');
  });
});
