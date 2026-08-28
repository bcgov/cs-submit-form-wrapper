import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppSessionSnapshot } from '@/src/app/routing/appRoutePolicy';

// Mutable test doubles shared with the hoisted vi.mock factories below.
const h = vi.hoisted(() => ({
  dispatch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  refreshWorkspaces: vi.fn(),
  session: {} as AppSessionSnapshot,
}));

vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => ({ refresh: h.refresh }),
}));

vi.mock('@/lib/store', () => ({
  useAppDispatch: () => h.dispatch,
}));

vi.mock('@/src/shared/api/useWorkspaces', () => ({
  useRefreshWorkspaces: () => h.refreshWorkspaces,
}));

// The guard is the route policy; what feeds it is covered in useAppSession's own tests.
vi.mock('@/src/app/routing/useAppSession', () => ({
  useAppSession: () => h.session,
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    general: {
      loading: 'Loading…',
      sessionError: 'We could not load your session.',
      tryAgain: 'Try again',
    },
  }),
}));

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<unknown>('next/navigation');
  return {
    ...(actual as Record<string, unknown>),
    useRouter: () => ({ replace: h.replace }),
    usePathname: () => '/en/forms',
  };
});

import { AppAccessGuard } from '@/src/app/routing/AppAccessGuard';
import { clearCurrentUser } from '@/lib/slices/currentUserSlice';

const READY: AppSessionSnapshot = {
  authenticated: true,
  initializing: false,
  initStarted: true,
  sessionReady: true,
  sessionLoadedOnce: true,
  sessionFailed: false,
  needsOnboarding: false,
  canCreateWorkspace: true,
  hasWorkspaces: true,
};

function renderGuard() {
  return render(
    <AppAccessGuard locale="en" workspacesEnabled={true}>
      visible child
    </AppAccessGuard>,
  );
}

describe('AppAccessGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.refresh.mockResolvedValue(undefined);
    h.refreshWorkspaces.mockResolvedValue([]);
    h.session = { ...READY };
  });

  it('shows the spinner (not the error) while bootstrap loads are pending', async () => {
    h.session = { ...READY, sessionReady: false, sessionLoadedOnce: false };

    await act(async () => {
      renderGuard();
    });

    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    expect(screen.queryByTestId('session-error-retry')).not.toBeInTheDocument();
  });

  it('renders the error + retry instead of an infinite spinner when a load fails', async () => {
    h.session = { ...READY, sessionReady: false, sessionLoadedOnce: false, sessionFailed: true };

    await act(async () => {
      renderGuard();
    });

    expect(screen.getByText('We could not load your session.')).toBeInTheDocument();
    expect(screen.getByTestId('session-error-retry')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalled();
  });

  // A partial retry leaves the other reads failed, so the alert never clears and the button
  // looks dead.
  it('retry refreshes the token then re-reads every bootstrap load', async () => {
    h.session = { ...READY, sessionReady: false, sessionLoadedOnce: false, sessionFailed: true };

    await act(async () => {
      renderGuard();
    });

    await userEvent.click(screen.getByTestId('session-error-retry'));

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.dispatch).toHaveBeenCalledWith(clearCurrentUser());
    expect(h.refreshWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('renders children once the session is ready', async () => {
    await act(async () => {
      renderGuard();
    });

    expect(screen.getByText('visible child')).toBeInTheDocument();
    expect(screen.queryByTestId('session-error-retry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
  });

  it('redirects to onboarding and holds the route while it does', async () => {
    h.session = { ...READY, needsOnboarding: true, hasWorkspaces: false };

    await act(async () => {
      renderGuard();
    });

    expect(h.replace).toHaveBeenCalledWith('/en/onboarding');
    expect(screen.queryByText('visible child')).not.toBeInTheDocument();
  });

  // Swapping children for the spinner unmounts the route: a form being filled loses its answers.
  it('keeps children mounted when a background load runs after bootstrap', async () => {
    const view = await act(async () => renderGuard());
    expect(screen.getByText('visible child')).toBeInTheDocument();

    // A token rotation re-reads /me: ready drops, but the session never stopped being valid.
    h.session = { ...READY, sessionReady: false };
    await act(async () => {
      view.rerender(
        <AppAccessGuard locale="en" workspacesEnabled={true}>
          visible child
        </AppAccessGuard>,
      );
    });

    expect(screen.getByText('visible child')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
  });

  it('keeps children mounted when a background load FAILS after bootstrap', async () => {
    const view = await act(async () => renderGuard());

    h.session = { ...READY, sessionReady: false, sessionFailed: true };
    await act(async () => {
      view.rerender(
        <AppAccessGuard locale="en" workspacesEnabled={true}>
          visible child
        </AppAccessGuard>,
      );
    });

    expect(screen.getByText('visible child')).toBeInTheDocument();
    expect(screen.queryByTestId('session-error-retry')).not.toBeInTheDocument();
  });
});
