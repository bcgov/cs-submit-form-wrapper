/**
 * Whether the cached data and per-tab view state belong to someone who is no longer here.
 *
 * Only a transition counts. Acting on the state "not authenticated" fires on every anonymous page
 * load, including one where a public read is already in flight, and acting on it before Keycloak
 * has answered fires on every load of any kind.
 */
export function isIdentityEnded(input: {
  previousSubject: string | undefined;
  currentSubject: string | undefined;
  authenticated: boolean;
  initStarted: boolean;
  initializing: boolean;
}): boolean {
  const { previousSubject, currentSubject, authenticated, initStarted, initializing } = input;
  if (!initStarted || initializing) return false;
  if (previousSubject === undefined) return false;
  if (!authenticated) return true;
  return currentSubject !== undefined && currentSubject !== previousSubject;
}
