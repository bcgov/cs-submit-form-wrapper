import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFeaturesMetaPayload } from '@/src/shared/config/featuresMeta';

const payload = {
  features: [
    {
      code: 'design-mode',
      name: 'Design mode',
      description: null,
      version: null,
      status: 'enabled',
      platformAllowed: true,
    },
  ],
};

function okResponse() {
  return { ok: true, status: 200, json: async () => payload } as unknown as Response;
}

function statusResponse(status: number) {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

describe('isFeaturesMetaPayload', () => {
  it('accepts valid payload', () => {
    expect(
      isFeaturesMetaPayload({
        features: [
          {
            code: 'design-mode',
            name: 'Design mode',
            description: null,
            version: null,
            status: 'enabled',
            platformAllowed: true,
          },
        ],
      }),
    ).toBe(true);
  });

  it('accepts an optional string availability', () => {
    expect(
      isFeaturesMetaPayload({
        features: [
          {
            code: 'document-generation-v3',
            name: 'Doc gen v3',
            description: null,
            version: null,
            status: 'enabled',
            platformAllowed: true,
            availability: 'scoped',
          },
        ],
      }),
    ).toBe(true);
  });

  it('rejects a non-string availability', () => {
    expect(
      isFeaturesMetaPayload({
        features: [
          {
            code: 'x',
            name: 'X',
            description: null,
            version: null,
            status: 'enabled',
            platformAllowed: true,
            availability: 3,
          },
        ],
      }),
    ).toBe(false);
  });

  it('rejects missing platformAllowed', () => {
    expect(
      isFeaturesMetaPayload({
        features: [
          {
            code: 'x',
            name: 'X',
            description: null,
            version: null,
            status: 'enabled',
          },
        ],
      }),
    ).toBe(false);
  });
});

describe('loadFeaturesMeta retries', () => {
  // The module caches a successful payload for the page's lifetime, so each case needs a fresh copy.
  async function freshLoader() {
    vi.resetModules();
    const mod = await import('@/src/shared/config/featuresMeta');
    return mod.loadFeaturesMeta;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recovers from a transport failure', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect((await freshLoader())()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 503 and gives up after the attempt limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(statusResponse(503));
    vi.stubGlobal('fetch', fetchMock);

    await expect((await freshLoader())()).rejects.toThrow('503');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 404, which is an answer rather than a blip', async () => {
    const fetchMock = vi.fn().mockResolvedValue(statusResponse(404));
    vi.stubGlobal('fetch', fetchMock);

    await expect((await freshLoader())()).rejects.toThrow('404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
