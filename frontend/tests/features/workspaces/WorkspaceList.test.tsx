import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => ({ authenticated: true, token: 'token', initializing: false }),
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    general: {
      notAuthenticated: 'Not authed',
      loading: 'Loading…',
      workspaceSwitchError: 'Failed to switch workspace.',
      search: 'Search',
    },
    workspaces: {
      tableHeading: 'Workspaces',
      empty: 'No workspaces found matching your criteria.',
      active: 'Active',
      columns: { name: 'Name', actions: 'Actions', roles: 'Roles', default: 'Default' },
      actions: { manage: 'Manage', forms: 'Forms' },
      createAction: 'Create',
      defaultWorkspaceLabel: 'Set {name} as default workspace',
      defaultWorkspaceError: 'Failed to update default workspace.',
    },
    dataTable: {
      itemName: 'items',
      pageOf: 'of {totalPages} page(s)',
    },
  }),
}));

const mockPush = vi.fn();
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<unknown>('next/navigation');
  return {
    ...(actual as Record<string, unknown>),
    useRouter: () => ({ push: mockPush }),
    usePathname: () => '/en/workspaces',
  };
});

const mockDispatch = vi.fn();
const mockUnwrap = vi.fn().mockResolvedValue('ws1');

vi.mock('@/lib/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({
      workspace: {
        activeWorkspaceId: 'ws1',
        status: 'succeeded',
        error: null,
        workspaces: [
          {
            id: 'ws1',
            name: 'Personal Workspace',
            kind: 'personal',
            role: 'owner',
            status: 'active',
          },
          {
            id: 'ws2',
            name: 'Team Workspace',
            kind: 'enterprise',
            role: 'member',
            status: 'active',
          },
        ],
      },
      currentUser: {
        data: {
          actor: { id: 'user-1', displayLabel: 'User', status: 'active' },
          profile: { displayName: 'User', email: null, preferredUsername: null },
          preferences: { defaultWorkspaceId: 'ws1' },
          capabilities: { canCreateWorkspace: true },
        },
        status: 'succeeded',
      },
    }),
}));

vi.mock('@/lib/hooks/useNotificationStore', () => ({
  useNotificationStore: () => ({ addNotification: vi.fn() }),
}));

import WorkspaceList from '@/src/features/workspaces/ui/WorkspaceList';

describe('WorkspaceList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: mockUnwrap });
  });

  it('renders the search input', async () => {
    await act(async () => {
      render(<WorkspaceList />);
    });
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('displays workspace rows with roles', async () => {
    await act(async () => {
      render(<WorkspaceList />);
    });
    expect(screen.getByText('Personal Workspace')).toBeInTheDocument();
    expect(screen.getByText('Team Workspace')).toBeInTheDocument();
    expect(screen.getByTestId('role-ws1')).toHaveTextContent('Owner');
    expect(screen.getByTestId('role-ws2')).toHaveTextContent('Member');
  });

  it('navigates to forms when workspace name is clicked', async () => {
    await act(async () => {
      render(<WorkspaceList />);
    });
    await userEvent.click(screen.getByTestId('workspace-link-ws2'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/en/forms'));
  });

  // Opening a workspace's forms is an explicit scope choice, unlike landing on the list directly.
  it('seeds the forms-list workspace filter with the chosen workspace', async () => {
    await act(async () => {
      render(<WorkspaceList />);
    });
    await userEvent.click(screen.getByTestId('workspace-link-ws2'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/en/forms'));
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'workspace/setSelectedWorkspaceId', payload: 'ws2' }),
    );
  });

  it('navigates to manage page on Manage action', async () => {
    let container: HTMLElement | null = null;
    await act(async () => {
      const res = render(<WorkspaceList />);
      container = res.container;
    });
    expect(container!.querySelector('[data-testid="manage-ws2-button"]')).toBeNull();
    const btn = container!.querySelector(
      '[data-testid="manage-ws1-button"]',
    ) as HTMLButtonElement | null;
    expect(btn).toBeTruthy();
    await userEvent.click(btn!);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/en/workspace/ws1'));
  });

  it('navigates to forms on Forms action', async () => {
    let container: HTMLElement | null = null;
    await act(async () => {
      const res = render(<WorkspaceList showFormsAction={true} />);
      container = res.container;
    });
    const btn = container!.querySelector(
      '[data-testid="forms-ws2-button"]',
    ) as HTMLButtonElement | null;
    expect(btn).toBeTruthy();
    await userEvent.click(btn!);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/en/forms'));
  });

  it('search filters workspaces', async () => {
    await act(async () => {
      render(<WorkspaceList />);
    });
    const input = screen
      .getByTestId('search-workspaces-text')
      .querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'team' } });
    expect(screen.queryByText('Personal Workspace')).not.toBeInTheDocument();
    expect(screen.getByText('Team Workspace')).toBeInTheDocument();
  });

  it('navigates to create page on Create action', async () => {
    await act(async () => {
      render(<WorkspaceList />);
    });
    await userEvent.click(screen.getByTestId('create-workspace-button'));
    expect(mockPush).toHaveBeenCalledWith('/en/workspace');
  });
});
