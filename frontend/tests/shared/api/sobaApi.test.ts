import { describe, it, expect, vi, afterEach } from 'vitest';
import { deleteSobaSubmission, selectWorkspace } from '@/src/shared/api/sobaApi';

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

function deleteResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
  } as unknown as Response;
}

describe('deleteSobaSubmission', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('DELETEs the design route and resolves on a 204 with no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(deleteResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteSobaSubmission('tok', 's1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/design/submissions/s1');
    expect(init.method).toBe('DELETE');
  });

  it('treats a 404 as already deleted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(deleteResponse(404, { error: 'Not found' })));

    await expect(deleteSobaSubmission('tok', 's1')).resolves.toBeUndefined();
  });

  it('throws the backend message on a 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(deleteResponse(403, { error: 'Insufficient form permissions' })),
    );

    await expect(deleteSobaSubmission('tok', 's1')).rejects.toThrow(
      'Insufficient form permissions',
    );
  });
});
