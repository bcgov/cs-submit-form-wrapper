import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  OAuth2TokenProvider,
  clearOAuth2TokenCache,
} from '../../../src/core/auth/oauth2TokenProvider';
import { HttpClientTimeoutError } from '../../../src/core/http/httpClient';
import { log } from '../../../src/core/logging';

const tokenResponse = (accessToken: string, expiresIn = 3600) =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ access_token: accessToken, expires_in: expiresIn }),
  }) as unknown as Response;

describe('OAuth2TokenProvider', () => {
  const origFetch = global.fetch;
  const config = { tokenUrl: 'http://idp.test/token', clientId: 'id', clientSecret: 'secret' };

  afterEach(() => {
    global.fetch = origFetch;
    clearOAuth2TokenCache();
    jest.restoreAllMocks();
  });

  it('fetches a client-credentials token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(tokenResponse('tok-1'));
    global.fetch = fetchMock;

    await expect(new OAuth2TokenProvider(config).getToken()).resolves.toBe('tok-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://idp.test/token');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('grant_type=client_credentials');
    expect(String(init.body)).toContain('client_id=id');
  });

  it('caches the token across calls', async () => {
    const fetchMock = jest.fn().mockResolvedValue(tokenResponse('tok-cache'));
    global.fetch = fetchMock;

    const provider = new OAuth2TokenProvider(config);
    await provider.getToken();
    await provider.getToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent misses onto a single token request', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(tokenResponse('tok-concurrent')), 10)),
      );
    global.fetch = fetchMock;

    const provider = new OAuth2TokenProvider(config);
    const tokens = await Promise.all([
      provider.getToken(),
      provider.getToken(),
      provider.getToken(),
    ]);

    expect(tokens).toEqual(['tok-concurrent', 'tok-concurrent', 'tok-concurrent']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches after clearCache', async () => {
    const fetchMock = jest.fn().mockResolvedValue(tokenResponse('tok'));
    global.fetch = fetchMock;

    const provider = new OAuth2TokenProvider(config);
    await provider.getToken();
    provider.clearCache();
    await provider.getToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes when the cached token is within the expiry buffer', async () => {
    const fetchMock = jest.fn().mockResolvedValue(tokenResponse('tok', 30));
    global.fetch = fetchMock;

    // 60s buffer against a 30s TTL means the cached token is always "too close" to expiry.
    const provider = new OAuth2TokenProvider({ ...config, refreshBufferMs: 60_000 });
    await provider.getToken();
    await provider.getToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when the token request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as unknown as Response);

    await expect(new OAuth2TokenProvider(config).getToken()).rejects.toThrow(
      'OAuth2 token request failed',
    );
  });

  it('logs the caller label and a credentials hint when the token request is rejected', async () => {
    const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => log);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as unknown as Response);

    await expect(
      new OAuth2TokenProvider({ ...config, label: 'cdogs-v2' }).getToken(),
    ).rejects.toThrow('OAuth2 token request failed');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'cdogs-v2', status: 401 }),
      expect.stringContaining('credentials'),
    );
    errorSpy.mockRestore();
  });

  it('throws when the response has no access_token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    await expect(new OAuth2TokenProvider(config).getToken()).rejects.toThrow(
      'missing access_token',
    );
  });

  // Real sockets: a stalled IdP used to hang indefinitely. Both phases must be covered — a token
  // endpoint that answers and then stalls mid-body is just as much a hang as one that never replies.
  it.each([
    ['never answers', '/stall-headers'],
    ['answers then stalls mid-body', '/stall-body'],
  ])('gives up on a token endpoint that %s', async (_label, path) => {
    const server = createServer((req, res) => {
      if (req.url === '/stall-body') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{"access_to');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const tokenUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`;

    try {
      const err = await new OAuth2TokenProvider({ ...config, tokenUrl, timeoutMs: 150 })
        .getToken()
        .catch((e) => e);

      expect(err).toBeInstanceOf(HttpClientTimeoutError);
      expect(err.message).toBe('Request timed out after 150ms');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // Callers share the request, not the deadline. Real sockets: the shared fetch has to outlive a
  // caller that gives up on it, and must not be slowed to another caller's pace.
  const withSlowTokenServer = async (run: (tokenUrl: string) => Promise<void>): Promise<void> => {
    const server = createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'shared', expires_in: 3600 }));
      }, 400);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/token`);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };

  it("holds a joiner to its own budget, not the first caller's", async () => {
    await withSlowTokenServer(async (tokenUrl) => {
      const provider = new OAuth2TokenProvider({ ...config, tokenUrl, timeoutMs: 5000 });

      const slow = provider.getToken(5000);
      const impatient = provider.getToken(100).catch((e) => e);

      // The joiner gives up on schedule...
      expect(await impatient).toBeInstanceOf(HttpClientTimeoutError);
      // ...without taking the shared request down with it.
      await expect(slow).resolves.toBe('shared');
    });
  });

  it('does not hold a healthy caller to a dying one', async () => {
    await withSlowTokenServer(async (tokenUrl) => {
      const provider = new OAuth2TokenProvider({ ...config, tokenUrl, timeoutMs: 5000 });

      const dying = provider.getToken(100).catch((e) => e);
      const healthy = provider.getToken(5000);

      expect(await dying).toBeInstanceOf(HttpClientTimeoutError);
      await expect(healthy).resolves.toBe('shared');
    });
  });

  it('rejects an unusable configured timeout at construction', () => {
    expect(() => new OAuth2TokenProvider({ ...config, timeoutMs: 0 })).toThrow(
      'must be a positive integer',
    );
  });
});
