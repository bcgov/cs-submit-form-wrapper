import { documentGenerationPluginDefinition } from '../../../src/plugins/cdogs-v3';
import { CdogsV3Adapter } from '../../../src/plugins/cdogs-v3/cdogsV3Adapter';
import {
  createPluginConfigReaderFrom,
  type PluginConfigReader,
} from '../../../src/core/config/pluginConfig';
import { createEnvReader } from '../../../src/core/config/env';
import { ServiceUnavailableError } from '../../../src/core/errors';

// Goes through the real reader rather than a stub, so the adapter sees the actual parsing.
function makeConfig(overrides: Partial<Record<string, string>> = {}): PluginConfigReader {
  const values: Record<string, string | undefined> = {
    ENDPOINT: 'http://cdogs3.test/api',
    ...overrides,
  };
  return createPluginConfigReaderFrom(
    createEnvReader(
      Object.fromEntries(
        Object.entries(values).map(([key, value]) => [`PLUGIN_CDOGS_V3_${key}`, value]),
      ),
    ),
    'cdogs-v3',
  );
}

const binaryOk = () =>
  ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/pdf' }),
    arrayBuffer: () => Promise.resolve(Uint8Array.from([7, 8]).buffer),
  }) as unknown as Response;

describe('cdogs-v3 plugin', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
  });

  it('declares the expected definition', () => {
    expect(documentGenerationPluginDefinition.code).toBe('cdogs-v3');
    expect(documentGenerationPluginDefinition.metadata).toEqual({
      code: 'cdogs-v3',
      name: 'CDOGS',
      version: 'v3',
    });
  });

  it('renders against the v3 endpoint without authentication', async () => {
    const fetchMock = jest.fn().mockResolvedValue(binaryOk());
    global.fetch = fetchMock;

    const res = await new CdogsV3Adapter(makeConfig()).render({ template: { content: 'x' } });

    expect(res.data).toEqual(Buffer.from([7, 8]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://cdogs3.test/api/v3/template/render');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('maps a transport failure to ServiceUnavailableError', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(new CdogsV3Adapter(makeConfig()).render({})).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });

  it('arms the configured TIMEOUT_MS', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    global.fetch = jest.fn().mockResolvedValue(binaryOk());

    await new CdogsV3Adapter(makeConfig({ TIMEOUT_MS: '4321' })).render({});

    expect(timeoutSpy.mock.calls.at(-1)?.[0]).toBeLessThanOrEqual(4321);
    expect(timeoutSpy.mock.calls.at(-1)?.[0]).toBeGreaterThan(4200);
  });

  it('rejects an unusable TIMEOUT_MS at construction', () => {
    expect(() => new CdogsV3Adapter(makeConfig({ TIMEOUT_MS: '0' }))).toThrow(
      'must be a positive integer',
    );
  });
});
