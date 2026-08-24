import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  HttpClient,
  HttpClientError,
  HttpClientTimeoutError,
  defaultTimeoutMs,
  joinUrl,
  routeTimeoutMs,
} from '../../../src/core/http/httpClient';

const binaryResponse = (body: number[], contentType = 'application/pdf') =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(contentType ? { 'content-type': contentType } : {}),
    arrayBuffer: () => Promise.resolve(Uint8Array.from(body).buffer),
  }) as unknown as Response;

describe('HttpClient', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
    jest.restoreAllMocks();
  });

  it('joins base + path, posts JSON, and returns the raw bytes', async () => {
    const fetchMock = jest.fn().mockResolvedValue(binaryResponse([1, 2, 3]));
    global.fetch = fetchMock;

    const client = new HttpClient({ baseUrl: 'http://svc.test/api/' });
    const res = await client.postJsonForBinary('/template/render', { a: 1 });

    expect(res).toEqual({ data: Buffer.from([1, 2, 3]), contentType: 'application/pdf' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://svc.test/api/template/render');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('adds a single slash when the path has none', async () => {
    const fetchMock = jest.fn().mockResolvedValue(binaryResponse([9]));
    global.fetch = fetchMock;

    await new HttpClient({ baseUrl: 'http://svc.test' }).postJsonForBinary('render', {});

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://svc.test/render');
  });

  it('injects a bearer token when getToken returns one', async () => {
    const fetchMock = jest.fn().mockResolvedValue(binaryResponse([9]));
    global.fetch = fetchMock;

    const client = new HttpClient({
      baseUrl: 'http://svc.test',
      getToken: () => Promise.resolve('tok-123'),
    });
    await client.postJsonForBinary('/x', {});

    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe(
      'Bearer tok-123',
    );
  });

  it('omits Authorization when getToken returns null', async () => {
    const fetchMock = jest.fn().mockResolvedValue(binaryResponse([0]));
    global.fetch = fetchMock;

    const client = new HttpClient({
      baseUrl: 'http://svc.test',
      getToken: () => Promise.resolve(null),
    });
    await client.postJsonForBinary('/x', {});

    expect(
      (fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });

  it('throws HttpClientError on a non-2xx response, carrying status, body, and url', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: () => Promise.resolve('bad template'),
    } as unknown as Response);

    const client = new HttpClient({ baseUrl: 'http://svc.test' });
    const err = await client.postJsonForBinary('/x', {}).catch((e) => e);

    expect(err).toBeInstanceOf(HttpClientError);
    expect(err).toMatchObject({ status: 422, body: 'bad template', url: 'http://svc.test/x' });
  });
});

// Real sockets: undici's timeout behaviour is what's under test.
describe('HttpClient timeouts', () => {
  const origFetch = global.fetch;
  let server: Server;
  let baseUrl: string;

  afterEach(() => {
    global.fetch = origFetch;
  });

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/stall-headers') return;
      if (req.url === '/stall-body') {
        res.writeHead(200, { 'content-type': 'application/pdf' });
        res.write('partial');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end('done');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('aborts a response that never sends headers', async () => {
    const client = new HttpClient({ baseUrl, timeoutMs: 150 });

    const err = await client.postJsonForBinary('/stall-headers', {}).catch((e) => e);

    expect(err).toBeInstanceOf(HttpClientTimeoutError);
    expect(err.url).toBe(`${baseUrl}/stall-headers`);
    // Armed from `deadline - Date.now()`, so a range: an exact match flakes on a busy runner.
    expect(err.timeoutMs).toBeGreaterThan(140);
    expect(err.timeoutMs).toBeLessThanOrEqual(150);
    expect(err.message).toContain('Request timed out after');
  });

  it('aborts a response whose body never finishes', async () => {
    const client = new HttpClient({ baseUrl, timeoutMs: 150 });

    const err = await client.postJsonForBinary('/stall-body', {}).catch((e) => e);

    expect(err).toBeInstanceOf(HttpClientTimeoutError);
    expect(err.url).toBe(`${baseUrl}/stall-body`);
    // The body leg reports what was left when it started, not the whole budget.
    expect(err.timeoutMs).toBeGreaterThan(0);
    expect(err.timeoutMs).toBeLessThan(150);
  });

  it('leaves a response that arrives within the deadline alone', async () => {
    const client = new HttpClient({ baseUrl, timeoutMs: 2000 });

    await expect(client.postJsonForBinary('/ok', {})).resolves.toMatchObject({
      data: Buffer.from('done'),
      contentType: 'application/pdf',
    });
  });

  it('arms the signal with the configured timeout, and with the default when unset', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response);
    global.fetch = fetchMock;

    // Armed from `deadline - Date.now()`, so assert a range: an exact match would flake whenever a
    // millisecond elapses between the two.
    const armedFor = (spy: jest.SpyInstance) => spy.mock.calls.at(-1)?.[0] as number;

    const configured = new HttpClient({ baseUrl: 'http://svc.test', timeoutMs: 1234 });
    await configured.postJsonForBinary('/x', {});
    expect(armedFor(timeoutSpy)).toBeGreaterThan(1150);
    expect(armedFor(timeoutSpy)).toBeLessThanOrEqual(1234);

    await new HttpClient({ baseUrl: 'http://svc.test' }).postJsonForBinary('/x', {});
    expect(armedFor(timeoutSpy)).toBeGreaterThan(defaultTimeoutMs() - 100);
    expect(armedFor(timeoutSpy)).toBeLessThanOrEqual(defaultTimeoutMs());
  });

  it('spends one budget across the token leg and the request', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response);

    const client = new HttpClient({
      baseUrl: 'http://svc.test',
      timeoutMs: 1000,
      // A slow token leg must come out of the request's budget, not sit alongside it.
      getToken: async (remainingMs) => {
        expect(remainingMs).toBeLessThanOrEqual(1000);
        await new Promise((r) => setTimeout(r, 300));
        return 'tok';
      },
    });
    await client.postJsonForBinary('/x', {});

    const armed = timeoutSpy.mock.calls.at(-1)?.[0] as number;
    expect(armed).toBeLessThan(1000 - 250);
  });

  it('fails fast once the budget is already spent', async () => {
    const client = new HttpClient({ baseUrl: 'http://svc.test', timeoutMs: 1000 });
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const spent = Date.now() - 1;
    const err = await client.postJsonForBinary('/x', {}, spent).catch((e) => e);

    expect(err).toBeInstanceOf(HttpClientTimeoutError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 2_147_483_648 is the one that matters: AbortSignal.timeout accepts it, then fires in ~1ms.
  it.each([0, -1, 30.5, NaN, Infinity, 2_147_483_648, 60_000 + 1])(
    'rejects an unusable timeout: %p',
    (value) => {
      expect(() => new HttpClient({ baseUrl: 'http://svc.test', timeoutMs: value })).toThrow(
        'must be a positive integer',
      );
    },
  );
});

// Per-plugin value wins, then HTTP_OUTBOUND_TIMEOUT_MS, then half the route timeout.
describe('timeout configuration', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('derives the default from the route timeout', () => {
    delete process.env.HTTP_ROUTE_TIMEOUT_MS;
    delete process.env.HTTP_OUTBOUND_TIMEOUT_MS;
    expect(routeTimeoutMs()).toBe(60_000);
    expect(defaultTimeoutMs()).toBe(30_000);
  });

  it('follows HTTP_ROUTE_TIMEOUT_MS', () => {
    process.env.HTTP_ROUTE_TIMEOUT_MS = '20000';
    expect(routeTimeoutMs()).toBe(20_000);
    expect(defaultTimeoutMs()).toBe(10_000);
  });

  it('lets HTTP_OUTBOUND_TIMEOUT_MS override the derived default', () => {
    process.env.HTTP_OUTBOUND_TIMEOUT_MS = '5000';
    expect(defaultTimeoutMs()).toBe(5_000);
    expect(new HttpClient({ baseUrl: 'http://svc.test' })).toBeInstanceOf(HttpClient);
  });

  it('still lets a plugin override the env default', () => {
    process.env.HTTP_OUTBOUND_TIMEOUT_MS = '5000';
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response);

    return new HttpClient({ baseUrl: 'http://svc.test', timeoutMs: 9000 })
      .postJsonForBinary('/x', {})
      .then(() => {
        const armed = timeoutSpy.mock.calls.at(-1)?.[0] as number;
        expect(armed).toBeGreaterThan(8900);
        expect(armed).toBeLessThanOrEqual(9000);
      });
  });

  it('rejects an outbound default above the route timeout', () => {
    process.env.HTTP_ROUTE_TIMEOUT_MS = '10000';
    process.env.HTTP_OUTBOUND_TIMEOUT_MS = '20000';
    expect(() => new HttpClient({ baseUrl: 'http://svc.test' })).toThrow(
      'HTTP_OUTBOUND_TIMEOUT_MS must be a positive integer',
    );
  });

  it('rejects an unusable HTTP_ROUTE_TIMEOUT_MS', () => {
    process.env.HTTP_ROUTE_TIMEOUT_MS = '0';
    expect(() => routeTimeoutMs()).toThrow('HTTP_ROUTE_TIMEOUT_MS must be a positive integer');
  });
});

describe('joinUrl', () => {
  it('joins with exactly one slash regardless of stray slashes', () => {
    expect(joinUrl('http://x/api', 'v2')).toBe('http://x/api/v2');
    expect(joinUrl('http://x/api/', 'v2')).toBe('http://x/api/v2');
    expect(joinUrl('http://x/api/', '/v2')).toBe('http://x/api/v2');
  });
});
