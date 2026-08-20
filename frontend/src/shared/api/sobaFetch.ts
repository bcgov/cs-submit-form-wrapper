import { ensureFreshToken, forceRefreshToken } from '../auth/tokenRefresh';
import { getSobaApiBaseUrl } from '../config/runtimeConfig';
import { getWorkspaceId, setWorkspaceId } from '../workspace/workspaceStore';
import { notifyWorkspaceResolved } from '../workspace/workspaceSync';

export const WORKSPACE_HEADER = 'x-soba-workspace-id';

export type SobaFetchOptions = {
  /** Bearer token; when present an Authorization header is sent. */
  token?: string;
  method?: string;
  /** JSON body; serialized and sent with a Content-Type: application/json header. */
  json?: unknown;
  /**
   * Workspace id for workspace-scoped calls (lists/creates). Sent as the `workspaceId`
   * query param read from per-tab storage by the caller. Resource calls omit this and
   * let the backend derive the workspace from the resource.
   */
  workspaceId?: string;
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
  if (options.workspaceId) {
    params.set('workspaceId', options.workspaceId);
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

function captureResolvedWorkspace(response: Response): void {
  const resolved = response.headers.get(WORKSPACE_HEADER);
  if (resolved && resolved !== getWorkspaceId()) {
    setWorkspaceId(resolved);
    notifyWorkspaceResolved(resolved);
  }
}

/**
 * Single entry point for all SOBA API calls. Injects auth/JSON headers (never a workspace
 * request header) and, after the response, captures the echoed `x-soba-workspace-id`
 * header to update the per-tab workspace store and Redux mirror.
 *
 * Authenticated calls refresh the token first, so an idle tab recovers on its next call. Anonymous
 * (submit-mode) callers pass none and never trigger a refresh.
 */
export async function sobaFetch(path: string, options: SobaFetchOptions = {}): Promise<Response> {
  const url = buildUrl(path, options);
  const body = options.json !== undefined ? JSON.stringify(options.json) : undefined;
  const token = options.token ? await resolveToken(options.token) : undefined;

  let response = await send(url, options, token, body);

  // Refresh and replay once; a second 401 is a real answer and goes back to the caller.
  if (response.status === 401 && token) {
    const outcome = await forceRefreshToken();
    // Same rule as the pre-flight path: an affirmative no-session is reported as one rather than
    // handed back as a bare 401 the caller would render as "not found" or "failed to load".
    if (outcome.status === 'no-session') throw new SessionExpiredError();
    if (outcome.status === 'token' && outcome.token !== token) {
      response = await send(url, options, outcome.token, body);
    }
  }

  captureResolvedWorkspace(response);

  return response;
}
