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
      sessionExpired: 'Your session has ended.',
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
      listLoadError: 'Failed to load workspaces.',
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
const { search } = vi.hoisted(() => ({ search: { value: '' } }));
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<unknown>('next/navigation');
  return {
    ...(actual as Record<string, unknown>),
    useRouter: () => ({ push: mockPush }),
    usePathname: () => '/en/workspaces',
    useSearchParams: () => new URLSearchParams(search.value),
  };
});

const fetchWorkspaces = vi.fn();
const fetchCurrentUser = vi.fn();
vi.mock('@/src/shared/api/sobaApi', () => ({
  fetchWorkspaces: (...args: unknown[]) => fetchWorkspaces(...args),
  fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
}));

vi.mock('@/lib/hooks/useNotificationStore', () => ({
  useNotificationStore: () => ({ addNotification: vi.fn() }),
}));

import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';
import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import WorkspaceList from '@/src/features/workspaces/ui/WorkspaceList';

const WORKSPACES = [
  { id: 'ws1', name: 'Personal Workspace', kind: 'personal', role: 'owner', status: 'active' },
  { id: 'ws2', name: 'Team Workspace', kind: 'enterprise', role: 'member', status: 'active' },
];

let store: ReturnType<typeof makeStore>;

function renderList(props: { showFormsAction?: boolean } = {}) {
  return render(
    <Provider store={store}>
      <SWRConfig
        value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
      >
        <WorkspaceList {...props} />
      </SWRConfig>
    </Provider>,
  );
}

describe('WorkspaceList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    search.value = '';
    store = makeStore();
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
    fetchWorkspaces.mockResolvedValue({
      items: WORKSPACES,
      page: { offset: 0, limit: 10, total: 2 },
    });
    fetchCurrentUser.mockResolvedValue({
      actor: { id: 'user-1', displayLabel: 'User', status: 'active' },
      profile: { displayName: 'User', email: null, preferredUsername: null },
      preferences: { defaultWorkspaceId: 'ws1' },
      capabilities: { canCreateWorkspace: true },
    });
  });

  it('renders the search input', async () => {
    await act(async () => {
      renderList();
    });
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('displays workspace rows with roles', async () => {
    await act(async () => {
      renderList();
    });
    expect(screen.getByText('Personal Workspace')).toBeInTheDocument();
    expect(screen.getByText('Team Workspace')).toBeInTheDocument();
    expect(screen.getByTestId('role-ws1')).toHaveTextContent('Owner');
    expect(screen.getByTestId('role-ws2')).toHaveTextContent('Member');
  });

  // Opening a workspace's forms is an explicit scope choice, unlike landing on the list directly,
  // so the chosen workspace travels in the URL as the forms-list filter.
  it('navigates to forms when workspace name is clicked', async () => {
    await act(async () => {
      renderList();
    });
    await userEvent.click(screen.getByTestId('workspace-link-ws2'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/en/forms?workspace=ws2'));
  });

  it('navigates to manage page on Manage action', async () => {
    let container: HTMLElement | null = null;
    await act(async () => {
      const res = renderList();
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
      const res = renderList({ showFormsAction: true });
      container = res.container;
    });
    const btn = container!.querySelector(
      '[data-testid="forms-ws2-button"]',
    ) as HTMLButtonElement | null;
    expect(btn).toBeTruthy();
    await userEvent.click(btn!);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/en/forms?workspace=ws2'));
  });

  // Searching only the fetched page would hide every match past it, so the term goes to the server.
  it('sends the search term to the server once typing stops', async () => {
    let view: ReturnType<typeof renderList> | undefined;
    await act(async () => {
      view = renderList();
    });
    const input = screen
      .getByTestId('search-workspaces-text')
      .querySelector('input') as HTMLInputElement;

    const replaceState = vi.spyOn(window.history, 'replaceState');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'team' } });
    });
    await waitFor(() => expect(replaceState).toHaveBeenCalled());

    // Next keeps useSearchParams in sync with replaceState; the mock does not, so the test does it.
    const url = replaceState.mock.calls.at(-1)?.[2];
    search.value = typeof url === 'string' ? (url.split('?')[1] ?? '') : '';
    await act(async () => {
      view!.rerender(
        <Provider store={store}>
          <SWRConfig
            value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
          >
            <WorkspaceList />
          </SWRConfig>
        </Provider>,
      );
    });

    await waitFor(() => expect(fetchWorkspaces.mock.calls.at(-1)?.[1]).toMatchObject({ q: 'team' }));
    replaceState.mockRestore();
  });

  it('asks for the page, size and sort the URL names', async () => {
    search.value = 'page=4&pageSize=25&sort=name:desc';
    await act(async () => {
      renderList();
    });
    await waitFor(() =>
      expect(fetchWorkspaces.mock.calls.at(-1)?.[1]).toMatchObject({
        offset: 75,
        limit: 25,
        sort: 'name:desc',
      }),
    );
  });

  it('navigates to create page on Create action', async () => {
    await act(async () => {
      renderList();
    });
    await userEvent.click(screen.getByTestId('create-workspace-button'));
    expect(mockPush).toHaveBeenCalledWith('/en/workspace');
  });

  it('reports an ended session rather than a generic load failure', async () => {
    const expired = new Error('Session expired');
    expired.name = 'SessionExpiredError';
    fetchWorkspaces.mockRejectedValue(expired);
    await act(async () => {
      renderList();
    });
    await waitFor(() => expect(screen.getByText(/Your session has ended\./)).toBeInTheDocument());
  });

  // The backend's string is untranslated and says things like "Request failed (500)".
  it('reports a failed load without showing the backend message', async () => {
    fetchWorkspaces.mockRejectedValue(new Error('Request failed (500)'));
    await act(async () => {
      renderList();
    });

    await waitFor(() =>
      expect(screen.getByText(/Failed to load workspaces\./)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Request failed/)).not.toBeInTheDocument();
  });
});
