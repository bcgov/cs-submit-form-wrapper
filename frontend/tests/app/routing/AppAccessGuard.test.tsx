import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mutable test doubles shared with the hoisted vi.mock factories below.
const h = vi.hoisted(() => ({
  dispatch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  state: {
    authenticated: true,
    initializing: false,
    token: 'token' as string | undefined,
    workspace: {
      workspaces: [] as Array<Record<string, unknown>>,
      status: 'idle' as 'idle' | 'loading' | 'succeeded' | 'failed',
      loadedOnce: false,
      activeWorkspaceId: null as string | null,
      error: null as string | null,
    },
    currentUser: {
      data: null as Record<string, unknown> | null,
      status: 'idle' as 'idle' | 'loading' | 'succeeded' | 'failed',
      loadedOnce: false,
    },
  },
}));

vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => ({
    authenticated: h.state.authenticated,
    token: h.state.token,
    initializing: h.state.initializing,
    refresh: h.refresh,
  }),
}));

vi.mock('@/lib/store', () => ({
  useAppDispatch: () => h.dispatch,
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({ workspace: h.state.workspace, currentUser: h.state.currentUser }),
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
import { clearWorkspaceState } from '@/lib/slices/workspaceSlice';

describe('AppAccessGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.refresh.mockResolvedValue(undefined);
    h.state.authenticated = true;
    h.state.initializing = false;
    h.state.token = 'token';
    h.state.workspace = {
      workspaces: [],
      status: 'idle',
      loadedOnce: false,
      activeWorkspaceId: null,
      error: null,
    };
    h.state.currentUser = { data: null, status: 'idle', loadedOnce: false };
  });

  it('shows the spinner (not the error) while bootstrap loads are pending', async () => {
    h.state.workspace.status = 'loading';
    h.state.currentUser.status = 'loading';

    await act(async () => {
      render(<AppAccessGuard locale="en" workspacesEnabled={true}>child</AppAccessGuard>);
    });

    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    expect(screen.queryByTestId('session-error-retry')).not.toBeInTheDocument();
  });

  it('renders the error + retry instead of an infinite spinner when a load fails', async () => {
    h.state.workspace.status = 'failed';
    h.state.currentUser.status = 'succeeded';

    await act(async () => {
      render(<AppAccessGuard locale="en" workspacesEnabled={true}>child</AppAccessGuard>);
    });

    expect(screen.getByText('We could not load your session.')).toBeInTheDocument();
    expect(screen.getByTestId('session-error-retry')).toBeInTheDocument();
    // No spinner, and no redirect fired (sessionReady is false on failure).
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it('retry refreshes the token then resets both slices so the loads re-fire', async () => {
    h.state.workspace.status = 'failed';
    h.state.currentUser.status = 'succeeded';

    await act(async () => {
      render(<AppAccessGuard locale="en" workspacesEnabled={true}>child</AppAccessGuard>);
    });

    await userEvent.click(screen.getByTestId('session-error-retry'));

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.dispatch).toHaveBeenCalledWith(clearCurrentUser());
    expect(h.dispatch).toHaveBeenCalledWith(clearWorkspaceState());
  });

  it('renders children once the session is ready', async () => {
    h.state.workspace = {
      workspaces: [{ id: 'ws1', kind: 'personal', role: 'owner' }],
      status: 'succeeded',
      loadedOnce: true,
      activeWorkspaceId: 'ws1',
      error: null,
    };
    h.state.currentUser = {
      data: { capabilities: { canCreateWorkspace: true } },
      status: 'succeeded',
      loadedOnce: true,
    };

    await act(async () => {
      render(<AppAccessGuard locale="en" workspacesEnabled={true}>visible child</AppAccessGuard>);
    });

    expect(screen.getByText('visible child')).toBeInTheDocument();
    expect(screen.queryByTestId('session-error-retry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
  });

  // Swapping children for the spinner unmounts the route: a form being filled loses its answers.
  it('keeps children mounted when a background load runs after bootstrap', async () => {
    h.state.workspace = {
      workspaces: [{ id: 'ws1', kind: 'personal', role: 'owner' }],
      status: 'succeeded',
      loadedOnce: true,
      activeWorkspaceId: 'ws1',
      error: null,
    };
    h.state.currentUser = {
      data: { capabilities: { canCreateWorkspace: true } },
      status: 'succeeded',
      loadedOnce: true,
    };

    const view = await act(async () => {
      return render(<AppAccessGuard locale="en" workspacesEnabled={true}>visible child</AppAccessGuard>);
    });
    expect(screen.getByText('visible child')).toBeInTheDocument();

    // A token rotation re-reads /me: ready drops, but the session never stopped being valid.
    h.state.currentUser.status = 'loading';
    await act(async () => {
      view.rerender(<AppAccessGuard locale="en" workspacesEnabled={true}>visible child</AppAccessGuard>);
    });

    expect(screen.getByText('visible child')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
  });

  it('keeps children mounted when a background load FAILS after bootstrap', async () => {
    h.state.workspace = {
      workspaces: [{ id: 'ws1', kind: 'personal', role: 'owner' }],
      status: 'succeeded',
      loadedOnce: true,
      activeWorkspaceId: 'ws1',
      error: null,
    };
    h.state.currentUser = {
      data: { capabilities: { canCreateWorkspace: true } },
      status: 'succeeded',
      loadedOnce: true,
    };

    const view = await act(async () => {
      return render(<AppAccessGuard locale="en" workspacesEnabled={true}>visible child</AppAccessGuard>);
    });

    // loadCurrentUser.rejected nulls `data` but leaves loadedOnce true — that is what keeps the
    // route mounted rather than swapping it for the retry alert.
    h.state.currentUser.status = 'failed';
    h.state.currentUser.data = null;
    await act(async () => {
      view.rerender(<AppAccessGuard locale="en" workspacesEnabled={true}>visible child</AppAccessGuard>);
    });

    expect(screen.getByText('visible child')).toBeInTheDocument();
    expect(screen.queryByTestId('session-error-retry')).not.toBeInTheDocument();
  });
});
