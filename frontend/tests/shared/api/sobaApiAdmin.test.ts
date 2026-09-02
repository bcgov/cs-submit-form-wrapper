import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchFeatureScope,
  fetchFeatureScopes,
  removeFeatureScope,
  removeSobaAdmin,
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
        featureCodes: ['document-generation-v3', 'files'],
        scopeType: 'workspace',
        status: 'active',
        offset: 0,
        limit: 25,
        sort: 'updatedAt:desc',
      }),
    ).resolves.toEqual({ items: [] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/feature-scopes');
    expect(String(url)).toContain('featureCode=document-generation-v3');
    expect(String(url)).toContain('scopeType=workspace');
    expect(String(url)).toContain('status=active');
    expect(String(url)).toContain('limit=25');
    expect(String(url)).toContain('sort=updatedAt%3Adesc');
    expect(String(url)).toContain('featureCodes=document-generation-v3%2Cfiles');
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

  // The row is gone either way, so a 404 is the outcome the caller asked for.
  it.each([
    ['feature scope', () => removeFeatureScope('tok', 'scope-1')],
    ['soba admin', () => removeSobaAdmin('tok', 'user-1')],
  ])('treats a 404 from deleting a %s as success', async (_label, call) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Not found' }, 404)));

    await expect(call()).resolves.toBeUndefined();
  });

  it('still reports a failed delete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Boom' }, 500)));

    await expect(removeFeatureScope('tok', 'scope-1')).rejects.toThrow('Boom');
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
