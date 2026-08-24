import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { documentGenerationPluginDefinition } from '../../../src/plugins/cdogs-v2';
import { CdogsV2Adapter } from '../../../src/plugins/cdogs-v2/cdogsV2Adapter';
import {
  createPluginConfigReaderFrom,
  type PluginConfigReader,
} from '../../../src/core/config/pluginConfig';
import { createEnvReader } from '../../../src/core/config/env';
import { clearOAuth2TokenCache } from '../../../src/core/auth/oauth2TokenProvider';
import { ServiceUnavailableError, UnprocessableEntityError } from '../../../src/core/errors';
import { log } from '../../../src/core/logging';

function makeConfig(overrides: Partial<Record<string, string>> = {}): PluginConfigReader {
  const values: Record<string, string | undefined> = {
    ENDPOINT: 'http://cdogs.test/api',
    TOKEN_URL: 'http://idp.test/token',
    CLIENT_ID: 'client',
    CLIENT_SECRET: 'secret',
    ...overrides,
  };
  // Mirrors createPluginConfigReaderFrom rather than reimplementing it, so the real parsing and
  // validation are what the adapter sees.
  return createPluginConfigReaderFrom(
    createEnvReader(
      Object.fromEntries(
        Object.entries(values).map(([key, value]) => [`PLUGIN_CDOGS_V2_${key}`, value]),
      ),
    ),
    'cdogs-v2',
  );
}

const tokenOk = () =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ access_token: 'tok', expires_in: 3600 }),
  }) as unknown as Response;

const binaryOk = () =>
  ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/pdf' }),
    arrayBuffer: () => Promise.resolve(Uint8Array.from([1, 2, 3]).buffer),
  }) as unknown as Response;

describe('cdogs-v2 plugin', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
    clearOAuth2TokenCache();
  });

  it('declares the expected definition', () => {
    expect(documentGenerationPluginDefinition.code).toBe('cdogs-v2');
    expect(documentGenerationPluginDefinition.metadata).toEqual({
      code: 'cdogs-v2',
      name: 'CDOGS',
      version: 'v2',
    });
  });

  it('renders against the v2 endpoint with a bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(binaryOk());
    global.fetch = fetchMock;

    const res = await new CdogsV2Adapter(makeConfig()).render({ template: { content: 'x' } });

    expect(res).toEqual({ data: Buffer.from([1, 2, 3]), contentType: 'application/pdf' });

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://idp.test/token');
    const [renderUrl, renderInit] = fetchMock.mock.calls[1];
    expect(renderUrl).toBe('http://cdogs.test/api/v2/template/render');
    expect((renderInit.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('clears the token and retries once when a render is rejected with 401', async () => {
    const unauthorized = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('token expired'),
    } as unknown as Response;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(tokenOk()) // initial token
      .mockResolvedValueOnce(unauthorized) // render rejected
      .mockResolvedValueOnce(tokenOk()) // refreshed token
      .mockResolvedValueOnce(binaryOk()); // render succeeds
    global.fetch = fetchMock;

    const res = await new CdogsV2Adapter(makeConfig()).render({ template: { content: 'x' } });

    expect(res.data).toEqual(Buffer.from([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('logs an identifiable auth failure when the 401 persists after refresh', async () => {
    const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => log);
    const unauthorized = () =>
      ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('token rejected'),
      }) as unknown as Response;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(unauthorized());

    await expect(new CdogsV2Adapter(makeConfig()).render({})).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ plugin: 'cdogs-v2' }),
      expect.stringContaining('credentials'),
    );
    errorSpy.mockRestore();
  });

  it('maps an upstream 422 to UnprocessableEntityError', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: () => Promise.resolve('bad template'),
      } as unknown as Response);
    global.fetch = fetchMock;

    await expect(new CdogsV2Adapter(makeConfig()).render({})).rejects.toBeInstanceOf(
      UnprocessableEntityError,
    );
  });

  it('readinessCheck returns ok when the authenticated GET /health succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce({ ok: true, status: 200 } as unknown as Response);
    global.fetch = fetchMock;

    const result = await new CdogsV2Adapter(makeConfig()).readinessCheck();

    expect(result).toEqual({ ok: true });
    const healthCall = fetchMock.mock.calls[1];
    expect(healthCall[0]).toContain('/v2/health');
    expect(healthCall[1].method).toBe('GET');
  });

  it('readinessCheck returns not-ok when /health fails', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve('down'),
      } as unknown as Response);
    global.fetch = fetchMock;

    const result = await new CdogsV2Adapter(makeConfig()).readinessCheck();

    expect(result.ok).toBe(false);
  });

  // End to end on real sockets: plugin TIMEOUT_MS → shared deadline → mapped 503. The budget is
  // the whole render — a slow token leg and a 401 retry come out of it, they don't extend it.
  it.each([
    ['a stalled render', false],
    ['a 401 that triggers the retry', true],
  ])('bounds %s by the configured timeout', async (_label, rejectFirstRender) => {
    let renders = 0;
    const server = createServer((req, res) => {
      if (req.url === '/token') {
        // Deliberately slow. Sized so a per-leg regression would land near 1000ms — well outside
        // the bound below — while a shared budget stays at 600ms however many legs there are.
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ access_token: `tok-${renders}`, expires_in: 3600 }));
        }, 400);
        return;
      }
      renders += 1;
      if (rejectFirstRender && renders === 1) {
        res.writeHead(401, { 'content-type': 'text/plain' });
        res.end('expired');
        return;
      }
      // Render never answers.
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      const adapter = new CdogsV2Adapter(
        makeConfig({ ENDPOINT: `${origin}/api`, TOKEN_URL: `${origin}/token`, TIMEOUT_MS: '600' }),
      );

      const started = Date.now();
      const err = await adapter.render({ template: { content: 'x' } }).catch((e) => e);
      const elapsed = Date.now() - started;

      expect(err).toBeInstanceOf(ServiceUnavailableError);
      expect(err.message).toContain('timed out');
      // One budget for the whole operation, not one per leg. Per-leg deadlines put the retry case
      // at ~1000ms, so this bound is what fails if the shared deadline is dropped.
      expect(elapsed).toBeLessThan(800);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects an unusable TIMEOUT_MS at construction', () => {
    expect(() => new CdogsV2Adapter(makeConfig({ TIMEOUT_MS: '0' }))).toThrow(
      'must be a positive integer',
    );
  });
});
