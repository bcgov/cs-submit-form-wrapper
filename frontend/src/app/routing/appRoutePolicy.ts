import { ROUTE_KIND_BY_SEGMENT } from './routeSegments';

export type RouteKind = 'home' | 'onboarding' | 'workspace-app' | 'workspaces' | 'public';

export type AppSessionSnapshot = {
  authenticated: boolean;
  initializing: boolean;
  sessionReady: boolean;
  /** Both bootstrap loads have produced data at least once. */
  sessionLoadedOnce: boolean;
  /** A required bootstrap fetch (current user or workspaces) rejected. */
  sessionFailed: boolean;
  needsOnboarding: boolean;
  canCreateWorkspace: boolean;
  hasWorkspaces: boolean;
};

/** Classify the localized route (pathname includes `/{locale}/...`). */
export function classifyRoute(pathname: string): RouteKind {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return 'home';
  }

  const route = segments[1] ?? '';
  return ROUTE_KIND_BY_SEGMENT[route] ?? 'public';
}

/**
 * Returns a path to `router.replace`, or null when the current route may render.
 * Caller should wait until `sessionReady` before redirecting authenticated users.
 *
 * `workspacesEnabled` is the frontend WORKSPACES gate for this deployment. When off (submit-mode),
 * the workspace-onboarding/create landing doesn't apply: `canCreateWorkspace` is a per-user
 * capability, not mode-aware, so a designer signing into the submit frontend would otherwise be
 * routed to `/workspaces` (404 there) or the workspace-access dead-end. Submit-mode lands on forms.
 */
export function resolveRedirect(
  pathname: string,
  locale: string,
  session: AppSessionSnapshot,
  workspacesEnabled: boolean,
): string | null {
  if (session.initializing) {
    return null;
  }

  const kind = classifyRoute(pathname);
  const home = `/${locale}`;
  const onboarding = `/${locale}/onboarding`;
  const forms = `/${locale}/forms`;
  const workspaces = `/${locale}/workspaces`;

  if (!session.authenticated) {
    if (kind === 'home' || kind === 'public') {
      return null;
    }
    return home;
  }

  if (!session.sessionReady) {
    return null;
  }

  const needsOnboarding = workspacesEnabled && session.needsOnboarding;

  let landing = forms;
  if (needsOnboarding) {
    landing = onboarding;
  } else if (workspacesEnabled && session.canCreateWorkspace && !session.hasWorkspaces) {
    landing = workspaces;
  }

  if (kind === 'home') {
    return landing;
  }

  if (kind === 'onboarding') {
    return needsOnboarding ? null : landing;
  }

  if (needsOnboarding && kind !== 'public') {
    return onboarding;
  }

  return null;
}
