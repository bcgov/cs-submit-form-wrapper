import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';

const { session, mutate, forgetListQueries, removeSessionValues } = vi.hoisted(() => ({
  session: {
    authenticated: false,
    token: undefined as string | undefined,
    idTokenParsed: undefined as { sub?: string } | undefined,
    initStarted: false,
    initializing: false,
  },
  mutate: vi.fn(),
  forgetListQueries: vi.fn(),
  removeSessionValues: vi.fn(),
}));

vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => ({
    ...session,
    logout: vi.fn(),
    init: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('swr', () => ({ useSWRConfig: () => ({ mutate }) }));

vi.mock('@/src/shared/list/listQueryMemory', () => ({ forgetListQueries }));
vi.mock('@/src/shared/storage/sessionStore', () => ({ removeSessionValues }));

vi.mock('@/src/shared/api/useCurrentUser', () => ({
  useCurrentUser: () => ({
    data: null,
    displayName: 'Test User',
    loaded: true,
    hasError: false,
  }),
}));
vi.mock('@/src/shared/api/useWorkspaces', () => ({
  useWorkspaces: () => ({ workspaces: [], loaded: false }),
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    general: { title: 'CHEFS', login: 'Login', logout: 'Logout' },
    header: {
      languages: { en: 'English' },
      selectLanguage: 'Language',
      bcgovTitle: 'BC Gov',
      skipToMain: 'Skip',
      primaryNavAria: 'Primary',
    },
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/forms',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

import { Header } from '@/app/ui/Header';

function renderHeader() {
  return render(<Header headerNavItems={[]} overlayNavItems={[]} showWorkspaces={false} />);
}

function cleared() {
  return (
    forgetListQueries.mock.calls.length > 0 &&
    mutate.mock.calls.length > 0 &&
    removeSessionValues.mock.calls.length > 0
  );
}

describe('Header session cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.authenticated = false;
    session.token = undefined;
    session.idTokenParsed = undefined;
    session.initStarted = false;
    session.initializing = false;
  });

  // "Not authenticated" is the default on every fresh load. Clearing there wipes this tab's cache
  // and list filters on every reload.
  it('does not clear before Keycloak has answered', async () => {
    await act(async () => {
      renderHeader();
    });
    expect(cleared()).toBe(false);
  });

  // An anonymous visitor has no previous session. Clearing here can discard a public read that is
  // already in flight.
  it('does not clear for a visitor who was never signed in', async () => {
    session.initStarted = true;
    await act(async () => {
      renderHeader();
    });
    expect(cleared()).toBe(false);
  });

  it('clears when a signed-in user signs out', async () => {
    session.initStarted = true;
    session.authenticated = true;
    session.token = 'token';
    session.idTokenParsed = { sub: 'user-1' };
    const view = await act(async () => renderHeader());
    expect(cleared()).toBe(false);

    session.authenticated = false;
    session.token = undefined;
    session.idTokenParsed = undefined;
    await act(async () => {
      view.rerender(<Header headerNavItems={[]} overlayNavItems={[]} showWorkspaces={false} />);
    });

    expect(cleared()).toBe(true);
  });

  // Signing out navigates away. An effect that does not run before the page unloads would leave
  // this tab's filters and dismissed prompts for whoever signs in next.
  it('clears on the sign-out press rather than waiting for the session to end', async () => {
    session.initStarted = true;
    session.authenticated = true;
    session.token = 'token';
    session.idTokenParsed = { sub: 'user-1' };
    await act(async () => {
      renderHeader();
    });
    expect(cleared()).toBe(false);

    await userEvent.click(screen.getByTestId('user-dropdown'));
    await userEvent.click(screen.getByTestId('logout-button'));

    // The session is still reporting the user as signed in: nothing but the press did this.
    expect(session.authenticated).toBe(true);
    expect(cleared()).toBe(true);
  });
});
