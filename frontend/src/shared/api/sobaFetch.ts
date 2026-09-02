import { ensureFreshToken, forceRefreshToken } from '../auth/tokenRefresh';
import { getSobaApiBaseUrl } from '../config/runtimeConfig';

export type SobaFetchOptions = {
  /** Bearer token; when present an Authorization header is sent. */
  token?: string;
  method?: string;
  /** JSON body; serialized and sent with a Content-Type: application/json header. */
  json?: unknown;
  /** Additional query params. */
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  cache?: RequestCache;
};

function buildUrl(path: string, options: SobaFetchOptions): string {
  const params = new URLSearchParams();
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
  }
  const qs = params.toString();
  const queryString = qs ? `?${qs}` : '';
  return `${getSobaApiBaseUrl()}${path}${queryString}`;
}

function send(
  url: string,
  options: SobaFetchOptions,
  token: string | undefined,
  body: string | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, {
    method: options.method ?? 'GET',
    cache: options.cache ?? 'no-store',
    headers,
    body,
  });
}

/** Thrown instead of sending a call the caller meant to authenticate but no longer can. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'SessionExpiredError';
  }
}

export const isSessionExpired = (err: unknown): boolean =>
  err instanceof Error && err.name === 'SessionExpiredError';

/**
 * The token to send for an authenticated call. Only an affirmative `no-session` refuses to send:
 * the submit surface accepts an invalid bearer as anonymous, so a stale token there would silently
 * file the caller's work as the public user. Without a verdict we send what we have and let the
 * response decide.
 */
async function resolveToken(callerToken: string): Promise<string> {
  const outcome = await ensureFreshToken();
  if (outcome.status === 'token') return outcome.token;
  if (outcome.status === 'no-session') throw new SessionExpiredError();
  return callerToken;
}

/**
 * Single entry point for all SOBA API calls. Injects auth/JSON headers.
 *
 * Authenticated calls refresh the token first, so an idle tab recovers on its next call. Anonymous
 * (submit-mode) callers pass none and never trigger a refresh.
 */
export async function sobaFetch(path: string, options: SobaFetchOptions = {}): Promise<Response> {
  const url = buildUrl(path, options);
  const body = options.json !== undefined ? JSON.stringify(options.json) : undefined;
  const token = options.token ? await resolveToken(options.token) : undefined;

  const response = await send(url, options, token, body);

  // Refresh and replay once. A 401 that survives that is the session being refused, not a verdict
  // on what this caller may do: the API answers a permission refusal with 403. Reporting it as an
  // ended session is what lets callers tell "sign in again" from "you do not have access".
  if (response.status === 401 && token) {
    const outcome = await forceRefreshToken();
    if (outcome.status === 'no-session') throw new SessionExpiredError();
    if (outcome.status === 'token' && outcome.token !== token) {
      const replayed = await send(url, options, outcome.token, body);
      if (replayed.status === 401) throw new SessionExpiredError();
      return replayed;
    }
    throw new SessionExpiredError();
  }

  return response;
}
