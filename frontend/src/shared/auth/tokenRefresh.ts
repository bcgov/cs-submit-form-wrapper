/**
 * Keeps sobaFetch out of the slice graph: importing keycloakSlice would close a cycle
 * (sobaFetch → keycloakSlice → workspaceSlice → sobaApi). The app registers a refresher instead.
 */

/**
 * `no-session` is Keycloak's own verdict that the session is over. `unavailable` means no verdict
 * was reached — no refresher, a throw, or the deadline below. The two must stay distinct: treating
 * a slow refresh as an ended session would sign people out of healthy sessions.
 */
export type RefreshOutcome =
  | { status: 'token'; token: string }
  | { status: 'no-session' }
  | { status: 'unavailable' };

/** Refreshes the access token and mirrors it into Redux. */
export type TokenRefresher = (force: boolean) => Promise<RefreshOutcome>;

// keycloak-js puts no timeout on updateToken, and every authenticated call waits on this.
const REFRESH_TIMEOUT_MS = 10_000;

const UNAVAILABLE: RefreshOutcome = { status: 'unavailable' };

let refresher: TokenRefresher | null = null;
let inFlight: { forced: boolean; promise: Promise<RefreshOutcome> } | null = null;

export function setTokenRefresher(next: TokenRefresher | null): void {
  refresher = next;
  inFlight = null;
}

function withDeadline(promise: Promise<RefreshOutcome>): Promise<RefreshOutcome> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<RefreshOutcome>((resolve) => {
    timer = setTimeout(() => resolve(UNAVAILABLE), REFRESH_TIMEOUT_MS);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function refresh(forced: boolean): Promise<RefreshOutcome> {
  if (!refresher) return Promise.resolve(UNAVAILABLE);
  // Concurrent callers share one refresh, but a forced one can't share a proactive one — that may
  // resolve without refreshing.
  if (inFlight && (inFlight.forced || !forced)) return inFlight.promise;

  const promise = withDeadline(refresher(forced).catch(() => UNAVAILABLE)).finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });
  inFlight = { forced, promise };
  return promise;
}

/** Refresh only when the token is close to expiry. */
export const ensureFreshToken = (): Promise<RefreshOutcome> => refresh(false);

/** Refresh unconditionally, after the server rejected the token we sent. */
export const forceRefreshToken = (): Promise<RefreshOutcome> => refresh(true);
