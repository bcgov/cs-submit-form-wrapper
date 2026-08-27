import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchFeatureScope,
  fetchFeatureScopes,
  removeFeatureScope,
  upsertFeatureScope,
} from '@/src/shared/api/sobaApiAdmin';

function response(body: unknown = {}, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

describe('sobaApiAdmin feature-scope helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches feature scopes with query params and bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchFeatureScopes('tok', {
        featureCode: 'document-generation-v3',
        scopeType: 'workspace',
        status: 'active',
        limit: 25,
      }),
    ).resolves.toEqual({ items: [] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/feature-scopes');
    expect(String(url)).toContain('featureCode=document-generation-v3');
    expect(String(url)).toContain('scopeType=workspace');
    expect(String(url)).toContain('status=active');
    expect(String(url)).toContain('limit=25');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('fetches a feature scope by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ id: 'scope-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchFeatureScope('tok', 'scope-1')).resolves.toEqual({ id: 'scope-1' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/feature-scopes/scope-1');
    expect(init.method).toBe('GET');
  });

  it('deletes a feature scope by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(null, 204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(removeFeatureScope('tok', 'scope-1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/feature-scopes/scope-1');
    expect(init.method).toBe('DELETE');
  });

  it('upserts a feature scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(null, 204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      upsertFeatureScope('tok', {
        featureCode: 'document-generation-v3',
        scopeType: 'form',
        scopeId: '11111111-1111-4111-8111-111111111111',
        status: 'inactive',
      }),
    ).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/feature-scopes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      featureCode: 'document-generation-v3',
      scopeType: 'form',
      scopeId: '11111111-1111-4111-8111-111111111111',
      status: 'inactive',
    });
  });
});
