import { HttpClientTimeoutError, isTimeoutAbort, resolveTimeoutMs } from '../http/httpClient';
import { log } from '../logging';

interface CachedToken {
  token: string;
  expiresAt: number;
}

export interface OAuth2Config {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  /** Refresh this many ms before the token actually expires. Default 60000. */
  refreshBufferMs?: number;
  /** Identifies the caller (e.g. plugin code) in credential-failure logs. */
  label?: string;
  /** Fallback deadline when the caller passes none; a stalled IdP hangs the caller too. */
  timeoutMs?: number;
}

const DEFAULT_REFRESH_BUFFER_MS = 60_000;
const DEFAULT_EXPIRES_IN_S = 3600;

// Module-level state shared across providers, keyed by tokenUrl + clientId.
const cache = new Map<string, CachedToken>();
const inFlight = new Map<string, Promise<string>>();

/** OAuth2 client-credentials token source with caching. */
export class OAuth2TokenProvider {
  private readonly config: OAuth2Config;
  private readonly cacheKey: string;
  private readonly timeoutMs: number;

  constructor(config: OAuth2Config) {
    this.config = config;
    this.cacheKey = `${config.tokenUrl}:${config.clientId}`;
    this.timeoutMs = resolveTimeoutMs(config.timeoutMs, 'OAuth2 timeoutMs');
  }

  /** `timeoutMs` is the caller's remaining budget, which bounds only this caller's wait. */
  async getToken(timeoutMs?: number): Promise<string> {
    const buffer = this.config.refreshBufferMs ?? DEFAULT_REFRESH_BUFFER_MS;
    const cached = cache.get(this.cacheKey);
    if (cached && Date.now() < cached.expiresAt - buffer) {
      return cached.token;
    }
    // Collapse concurrent misses onto a single token request per cache key.
    const pending = inFlight.get(this.cacheKey) ?? this.startRequest();
    // Callers share the request but not the deadline: a joiner must not inherit whatever budget
    // the first caller happened to have, and its own expiry must not abort a fetch the others
    // are still waiting on.
    return timeoutMs === undefined ? pending : this.raceBudget(pending, timeoutMs);
  }

  private startRequest(): Promise<string> {
    const request = this.fetchAndCache(this.timeoutMs).finally(() =>
      inFlight.delete(this.cacheKey),
    );
    inFlight.set(this.cacheKey, request);
    // A caller that gives up early stops awaiting this; keep the rejection handled either way.
    request.catch(() => undefined);
    return request;
  }

  private raceBudget(pending: Promise<string>, timeoutMs: number): Promise<string> {
    let timer: ReturnType<typeof setTimeout>;
    const budget = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new HttpClientTimeoutError(this.config.tokenUrl, timeoutMs, timeoutMs)),
        timeoutMs,
      );
    });
    return Promise.race([pending, budget]).finally(() => clearTimeout(timer));
  }

  clearCache(): void {
    cache.delete(this.cacheKey);
  }

  private requestToken(timeoutMs: number): Promise<Response> {
    return fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  private async fetchAndCache(timeoutMs: number): Promise<string> {
    // The whole exchange is guarded, not just the headers: a token endpoint that answers and then
    // stalls mid-body would otherwise escape with a raw DOMException.
    return this.withTimeoutGuard(timeoutMs, () => this.readToken(timeoutMs));
  }

  private async withTimeoutGuard<T>(timeoutMs: number, op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (isTimeoutAbort(err)) {
        log.warn({ label: this.config.label, timeoutMs }, 'oauth2 token request timed out');
        throw new HttpClientTimeoutError(this.config.tokenUrl, timeoutMs, timeoutMs);
      }
      throw err;
    }
  }

  private async readToken(timeoutMs: number): Promise<string> {
    const res = await this.requestToken(timeoutMs);

    if (!res.ok) {
      log.error(
        { label: this.config.label, status: res.status, tokenUrl: this.config.tokenUrl },
        'oauth2 token request rejected (check client credentials)',
      );
      throw new Error(`OAuth2 token request failed: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
      throw new Error('OAuth2 token response missing access_token');
    }

    const expiresIn = json.expires_in ?? DEFAULT_EXPIRES_IN_S;
    cache.set(this.cacheKey, {
      token: json.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    });
    return json.access_token;
  }
}

/** Clear all cached tokens (tests / forced refresh). */
export function clearOAuth2TokenCache(): void {
  cache.clear();
  inFlight.clear();
}
