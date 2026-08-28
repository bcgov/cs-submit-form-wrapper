import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';
import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    general: {
      notAuthenticated: 'Not authed',
      forms: 'Forms',
      loading: 'Loading...',
      sessionExpired: 'Your session has ended.',
      create: 'Create',
      search: 'Search',
    },
    form: {
      nameLabel: 'Form Name',
      disclaimerRequired: 'Accept the workspace disclaimer before creating a form.',
    },
    header: {
      selectWorkspace: 'Select Workspace',
    },
    dataTable: {
      loadingMessage: 'Loading...',
      pageOf: 'of {totalPages} page(s)',
    },
    workspaces: {
      workspace: 'Workspace',
      allWorkspaces: 'All Workspaces',
      unavailableFilter: 'That workspace is not available to you.',
      clearFilter: 'Clear filter',
    },
    submission: {
      formList: {
        columns: {
          name: 'Name',
          actions: 'Actions',
          createdBy: 'Created By',
          createdAt: 'Created Date',
        },
      },
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
    usePathname: () => '/en/forms',
    useSearchParams: () => new URLSearchParams(search.value),
  };
});

const getSobaForms = vi.fn();
const fetchWorkspaces = vi.fn();
vi.mock('@/src/shared/api/sobaApi', () => ({
  getSobaForms: (...args: unknown[]) => getSobaForms(...args),
  fetchWorkspaces: (...args: unknown[]) => fetchWorkspaces(...args),
}));

import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import FormList from '@/src/features/designer/ui/FormList';
import { PageLayout } from '@/src/components/PageLayout';

type TestWorkspace = { id: string; name?: string; disclaimerAccepted: boolean };

let store: ReturnType<typeof makeStore>;

function seed(workspaces: TestWorkspace[], writable: TestWorkspace[] = workspaces) {
  store.dispatch(setToken('token'));
  store.dispatch(setAuthenticated(true));
  // The writable list is the same endpoint with a required-permission filter.
  fetchWorkspaces.mockImplementation((_token: string, requiredPermission?: string) =>
    Promise.resolve({ items: requiredPermission ? writable : workspaces }),
  );
}

async function renderList() {
  let view: ReturnType<typeof render> | undefined;
  await act(async () => {
    view = render(
      <Provider store={store}>
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <PageLayout headingId="forms-heading" heading="Forms">
            <FormList />
          </PageLayout>
        </SWRConfig>
      </Provider>,
    );
  });
  return view!;
}

function listTree() {
  return (
    <Provider store={store}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <PageLayout headingId="forms-heading" heading="Forms">
          <FormList />
        </PageLayout>
      </SWRConfig>
    </Provider>
  );
}

describe('FormList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    search.value = '';
    store = makeStore();
    getSobaForms.mockResolvedValue({
      items: [
        {
          id: 'f1',
          name: 'Form One',
          status: 'active',
          createdBy: 'alice',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'f2',
          name: 'Form Two',
          status: 'active',
          createdBy: 'bob',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  });

  // The sole workspace is never "selected" (the picker only renders for two or more), so the
  // gate has to read the workspaces a form could actually be created in.
  it('warns and disables Create when the only workspace has no accepted disclaimer', async () => {
    seed([{ id: 'ws1', disclaimerAccepted: false }]);
    await renderList();
    expect(screen.getByTestId('page-notice-disclaimer')).toBeInTheDocument();
    expect(screen.getByTestId('create-form-button')).toBeDisabled();
  });

  it('allows Create while showing all workspaces when one of them is accepted', async () => {
    seed([
      { id: 'ws1', disclaimerAccepted: false },
      { id: 'ws2', disclaimerAccepted: true },
    ]);
    await renderList();
    expect(screen.queryByTestId('page-notice-disclaimer')).not.toBeInTheDocument();
    expect(screen.getByTestId('create-form-button')).not.toBeDisabled();
  });

  // The picker scopes the list, not the new form's workspace, so it must not gate Create.
  it('keeps Create enabled when the selected workspace is unaccepted but another is not', async () => {
    search.value = 'workspace=ws1';
    seed([
      { id: 'ws1', disclaimerAccepted: false },
      { id: 'ws2', disclaimerAccepted: true },
    ]);
    await renderList();
    expect(screen.queryByTestId('page-notice-disclaimer')).not.toBeInTheDocument();
    expect(screen.getByTestId('create-form-button')).not.toBeDisabled();
  });

  // Read-only membership is not a creation target, so it must not enable Create either.
  it('disables Create when the user has no workspace they can create in', async () => {
    seed([{ id: 'ws1', disclaimerAccepted: true }], []);
    await renderList();
    expect(screen.queryByTestId('page-notice-disclaimer')).not.toBeInTheDocument();
    expect(screen.getByTestId('create-form-button')).toBeDisabled();
  });

  it('renders the search input', async () => {
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    await renderList();
    const input = screen
      .getByTestId('search-forms-text')
      .querySelector('input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it('loads and displays rows from API', async () => {
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    await renderList();
    await waitFor(() => expect(screen.getByText('Form One')).toBeInTheDocument());
    expect(screen.getByText('Form Two')).toBeInTheDocument();
  });

  it('search works to filter forms', async () => {
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    await renderList();
    await waitFor(() => expect(screen.getByText('Form One')).toBeInTheDocument());
    const input = screen
      .getByTestId('search-forms-text')
      .querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'two' } });
    expect(screen.queryByText('Form One')).not.toBeInTheDocument();
    expect(screen.getByText('Form Two')).toBeInTheDocument();
  });

  it('scopes the request to the workspace named in the URL', async () => {
    search.value = 'workspace=ws2';
    seed([
      { id: 'ws1', disclaimerAccepted: true },
      { id: 'ws2', disclaimerAccepted: true },
    ]);
    await renderList();
    await waitFor(() => expect(getSobaForms).toHaveBeenCalledWith('token', 'ws2'));
  });

  // A URL can name a workspace this user cannot see. Reading unscoped would leak another
  // workspace's rows under that filter, so the id has to be resolved before it is sent.
  it('ignores a workspace in the URL that the user cannot see, and says so', async () => {
    search.value = 'workspace=ws-unknown';
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    await renderList();
    await waitFor(() => expect(getSobaForms).toHaveBeenCalledWith('token', undefined));
    expect(screen.getByTestId('page-notice-workspace-filter')).toBeInTheDocument();
  });

  // The nav link back to the list is a bare href, so the filter has to be remembered per tab or
  // it is lost every time the user leaves the page.
  it('restores the last filter on a nav arrival, and scopes the first request', async () => {
    search.value = 'from=nav';
    sessionStorage.setItem('soba.listQuery.forms', JSON.stringify({ workspace: 'ws2' }));
    seed([
      { id: 'ws1', disclaimerAccepted: true },
      { id: 'ws2', disclaimerAccepted: true },
    ]);
    await renderList();
    await waitFor(() => expect(getSobaForms).toHaveBeenCalledWith('token', 'ws2'));
    // The unscoped read must never happen, or another workspace's rows land on screen first.
    expect(getSobaForms).not.toHaveBeenCalledWith('token', undefined);
  });

  it('does not restore a filter the user cleared', async () => {
    search.value = 'from=nav';
    sessionStorage.setItem('soba.listQuery.forms', JSON.stringify({}));
    seed([
      { id: 'ws1', disclaimerAccepted: true },
      { id: 'ws2', disclaimerAccepted: true },
    ]);
    await renderList();
    await waitFor(() => expect(getSobaForms).toHaveBeenCalledWith('token', undefined));
  });

  // Clearing removes the param, which looks exactly like a fresh arrival. Restoring more than once
  // puts the filter straight back and the picker cannot be set to All Workspaces.
  it('lets the user clear a restored filter', async () => {
    search.value = 'from=nav';
    sessionStorage.setItem('soba.listQuery.forms', JSON.stringify({ workspace: 'ws2' }));
    seed([
      { id: 'ws1', disclaimerAccepted: true },
      { id: 'ws2', disclaimerAccepted: true },
    ]);
    const view = await renderList();
    await waitFor(() => expect(getSobaForms).toHaveBeenCalledWith('token', 'ws2'));

    const picker = screen.getByTestId('workspace-select').querySelector('select')!;
    await act(async () => {
      fireEvent.change(picker, { target: { value: 'all' } });
    });
    // Next syncs useSearchParams with the replaceState the component just made; the mock does not,
    // so the test does it.
    search.value = '';
    await act(async () => {
      view.rerender(listTree());
    });

    await waitFor(() => expect(getSobaForms).toHaveBeenCalledWith('token', undefined));
    expect(sessionStorage.getItem('soba.listQuery.forms')).toBe(JSON.stringify({}));
  });

  // A bare URL is a bookmark or someone else's link. Restoring there would show them a filtered
  // table they did not ask for.
  it('does not restore on a bare URL with no nav marker', async () => {
    sessionStorage.setItem('soba.listQuery.forms', JSON.stringify({ workspace: 'ws2' }));
    seed([
      { id: 'ws1', disclaimerAccepted: true },
      { id: 'ws2', disclaimerAccepted: true },
    ]);
    await renderList();
    await waitFor(() => expect(getSobaForms).toHaveBeenCalledWith('token', undefined));
    expect(getSobaForms).not.toHaveBeenCalledWith('token', 'ws2');
    // Visiting a bare link is not a choice, so it must not erase the view set for this tab.
    expect(sessionStorage.getItem('soba.listQuery.forms')).toBe(
      JSON.stringify({ workspace: 'ws2' }),
    );
  });

  it('remembers the filter the URL arrived with', async () => {
    search.value = 'workspace=ws2';
    seed([
      { id: 'ws1', disclaimerAccepted: true },
      { id: 'ws2', disclaimerAccepted: true },
    ]);
    await renderList();
    await waitFor(() =>
      expect(sessionStorage.getItem('soba.listQuery.forms')).toBe(
        JSON.stringify({ workspace: 'ws2' }),
      ),
    );
  });

  it('reports an ended session instead of the raw error', async () => {
    const expired = new Error('Session expired');
    expired.name = 'SessionExpiredError';
    getSobaForms.mockRejectedValue(expired);
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    await renderList();
    await waitFor(() =>
      expect(screen.getByText(/Your session has ended\./)).toBeInTheDocument(),
    );
  });

  // Clicking the nav link while already on this page is a query-only navigation: the App Router
  // re-renders rather than remounting, so a mount-only restore never runs.
  it('restores on a nav arrival that does not remount', async () => {
    search.value = 'workspace=ws2';
    seed([
      { id: 'ws1', disclaimerAccepted: true },
      { id: 'ws2', disclaimerAccepted: true },
    ]);
    const view = await renderList();
    await waitFor(() => expect(getSobaForms).toHaveBeenCalledWith('token', 'ws2'));

    const replaceState = vi.spyOn(window.history, 'replaceState');
    search.value = 'from=nav';
    await act(async () => {
      view.rerender(listTree());
    });

    await waitFor(() => expect(getSobaForms).toHaveBeenLastCalledWith('token', 'ws2'));
    // The marker is consumed on arrival; leaving it in the URL would make a copied link restore
    // the reader's own view.
    expect(replaceState).toHaveBeenCalledWith(null, '', '/en/forms?workspace=ws2');
    replaceState.mockRestore();
  });
});
