import { describe, it, expect } from 'vitest';
import { classifyRoute, resolveRedirect } from '@/src/app/routing/appRoutePolicy';

const readySession = {
  authenticated: true,
  initializing: false,
  initStarted: true,
  sessionReady: true,
  sessionLoadedOnce: true,
  sessionFailed: false,
  needsOnboarding: false,
  canCreateWorkspace: false,
  hasWorkspaces: true,
};

describe('classifyRoute', () => {
  it('classifies home, onboarding, workspace-app, workspaces, and public routes', () => {
    expect(classifyRoute('/en')).toBe('home');
    expect(classifyRoute('/fr/onboarding')).toBe('onboarding');
    expect(classifyRoute('/en/forms')).toBe('workspace-app');
    expect(classifyRoute('/en/designer/abc')).toBe('workspace-app');
    expect(classifyRoute('/en/workspaces')).toBe('workspaces');
    expect(classifyRoute('/en/workspace/ws1')).toBe('workspaces');
    expect(classifyRoute('/en/help')).toBe('public');
    // The fill/submit route and single-submission view are public so anonymous submitters can reach
    // a public-audience form and see their confirmation; the backend authorizes the data.
    expect(classifyRoute('/en/form/abc')).toBe('public');
    expect(classifyRoute('/en/submit/sub1')).toBe('public');
    expect(classifyRoute('/en/submission/sub1')).toBe('public');
    // The submissions management table stays staff-only.
    expect(classifyRoute('/en/submissions/f1')).toBe('workspace-app');
  });
});

// Design-mode: workspaces feature enabled for the deployment.
describe('resolveRedirect — workspaces enabled', () => {
  it('sends unauthenticated users on protected routes to home', () => {
    expect(
      resolveRedirect(
        '/en/forms',
        'en',
        { ...readySession, authenticated: false, sessionReady: true },
        true,
      ),
    ).toBe('/en');
  });

  // Before Keycloak has run, `authenticated: false` is the default rather than an answer. Acting on
  // it bounces a deep link through home to the landing route, losing the path and its query string.
  it('does not redirect before Keycloak init has started', () => {
    const unstarted = { ...readySession, authenticated: false, initStarted: false };
    expect(resolveRedirect('/en/forms', 'en', unstarted, true)).toBeNull();
    expect(resolveRedirect('/en/workspaces', 'en', unstarted, true)).toBeNull();
    expect(resolveRedirect('/en/designer/abc', 'en', unstarted, true)).toBeNull();
  });

  it('allows unauthenticated users on home and public routes', () => {
    const guest = { ...readySession, authenticated: false, sessionReady: true };
    expect(resolveRedirect('/en', 'en', guest, true)).toBeNull();
    expect(resolveRedirect('/en/help', 'en', guest, true)).toBeNull();
    expect(resolveRedirect('/en/form/abc', 'en', guest, true)).toBeNull();
    expect(resolveRedirect('/en/submission/sub1', 'en', guest, true)).toBeNull();
  });

  it('sends authenticated home visitors to onboarding or forms', () => {
    expect(resolveRedirect('/en', 'en', { ...readySession, needsOnboarding: true }, true)).toBe(
      '/en/onboarding',
    );
    expect(resolveRedirect('/en', 'en', readySession, true)).toBe('/en/forms?from=nav');
  });

  it('sends a brand-new creator from home to workspaces, matching onboarding', () => {
    const newCreator = { ...readySession, hasWorkspaces: false, canCreateWorkspace: true };
    expect(resolveRedirect('/en', 'en', newCreator, true)).toBe('/en/workspaces');
    expect(resolveRedirect('/en/onboarding', 'en', newCreator, true)).toBe('/en/workspaces');
  });

  it('keeps onboarding users on onboarding and redirects others away', () => {
    const onboarding = { ...readySession, needsOnboarding: true };
    expect(resolveRedirect('/en/onboarding', 'en', onboarding, true)).toBeNull();
    expect(resolveRedirect('/en/forms', 'en', onboarding, true)).toBe('/en/onboarding');
  });

  it('funnels onboarding users off workspace routes but not public ones', () => {
    const onboarding = { ...readySession, needsOnboarding: true };
    expect(resolveRedirect('/en/workspaces', 'en', onboarding, true)).toBe('/en/onboarding');
    expect(resolveRedirect('/en/workspace/ws1', 'en', onboarding, true)).toBe('/en/onboarding');
    expect(resolveRedirect('/en/help', 'en', onboarding, true)).toBeNull();
  });

  it('redirects off onboarding when access is available', () => {
    expect(resolveRedirect('/en/onboarding', 'en', readySession, true)).toBe('/en/forms?from=nav');
    expect(
      resolveRedirect(
        '/en/onboarding',
        'en',
        { ...readySession, hasWorkspaces: false, canCreateWorkspace: true },
        true,
      ),
    ).toBe('/en/workspaces');
  });

  it('waits for session bootstrap before redirecting authenticated users', () => {
    expect(resolveRedirect('/en', 'en', { ...readySession, sessionReady: false }, true)).toBeNull();
  });
});

// Submit-mode: workspaces feature disabled — no workspace onboarding/create landing.
describe('resolveRedirect — workspaces disabled', () => {
  it('lands authenticated users on forms regardless of workspace state', () => {
    expect(resolveRedirect('/en', 'en', { ...readySession, needsOnboarding: true }, false)).toBe(
      '/en/forms?from=nav',
    );
    const newCreator = { ...readySession, hasWorkspaces: false, canCreateWorkspace: true };
    expect(resolveRedirect('/en', 'en', newCreator, false)).toBe('/en/forms?from=nav');
    expect(resolveRedirect('/en', 'en', readySession, false)).toBe('/en/forms?from=nav');
  });

  it('does not funnel users into the workspace onboarding dead-end', () => {
    const onboarding = { ...readySession, needsOnboarding: true };
    expect(resolveRedirect('/en/forms', 'en', onboarding, false)).toBeNull();
    expect(resolveRedirect('/en/onboarding', 'en', onboarding, false)).toBe('/en/forms?from=nav');
  });

  it('does not redirect on workspace routes — the layout 404s instead', () => {
    // needsOnboarding is suppressed, so the guard returns null and defers to the route's notFound().
    const onboarding = { ...readySession, needsOnboarding: true };
    expect(resolveRedirect('/en/workspaces', 'en', onboarding, false)).toBeNull();
    expect(resolveRedirect('/en/workspace/ws1', 'en', onboarding, false)).toBeNull();
  });

  it('still sends unauthenticated users on protected routes to home', () => {
    expect(
      resolveRedirect(
        '/en/forms',
        'en',
        { ...readySession, authenticated: false, sessionReady: true },
        false,
      ),
    ).toBe('/en');
  });
});
