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
      noAccess: 'You do not have access to this.',
      create: 'Create',
      search: 'Search',
    },
    form: {
      nameLabel: 'Form Name',
      disclaimerRequired: 'Accept the workspace disclaimer before creating a form.',
      loadFormsError: 'Failed to load forms.',
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
  fetchWorkspaces.mockImplementation(
    (_token: string, options: { requiredPermission?: string } = {}) =>
      Promise.resolve({ items: options.requiredPermission ? writable : workspaces }),
  );
}

async function renderList() {
  let view: ReturnType<typeof render> | undefined;
  await act(async () => {
    view = render(
      <Provider store={store}>
        <SWRConfig
          value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
        >
          <PageLayout headingId="forms-heading" heading="Forms">
            <FormList />
          </PageLayout>
        </SWRConfig>
      </Provider>,
    );
  });
  return view!;
}

/** The workspace the last forms request was scoped to, `undefined` for an unscoped read. */
const scopedTo = (workspaceId?: string) =>
  getSobaForms.mock.calls.some((call) => call[1]?.workspaceId === workspaceId);

const lastFormsQuery = () => getSobaForms.mock.calls.at(-1)?.[1];

/**
 * Next keeps useSearchParams in sync with the component's replaceState; the mock does not, so a
 * change made on screen has to be fed back before the next render sees it.
 */
async function syncUrl(view: ReturnType<typeof render>) {
  const url = (window.history.replaceState as ReturnType<typeof vi.spyOn>).mock.calls.at(-1)?.[2];
  search.value = typeof url === 'string' ? (url.split('?')[1] ?? '') : '';
  await act(async () => {
    view.rerender(listTree());
  });
}

function listTree() {
  return (
    <Provider store={store}>
      <SWRConfig
        value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
      >
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
      page: { offset: 0, limit: 10, total: 2 },
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
    search.value = 'forms.workspace=ws1';
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

  // Searching only the fetched page would hide every match past it, so the term goes to the server.
  it('sends the search term to the server when the search is submitted', async () => {
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    const view = await renderList();
    await waitFor(() => expect(screen.getByText('Form One')).toBeInTheDocument());
    const input = screen
      .getByTestId('search-forms-text')
      .querySelector('input') as HTMLInputElement;

    const replaceState = vi.spyOn(window.history, 'replaceState');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'two' } });
    });
    expect(replaceState).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('search-forms-button'));
    });
    await waitFor(() => expect(replaceState).toHaveBeenCalled());
    await syncUrl(view);

    await waitFor(() => expect(lastFormsQuery()?.q).toBe('two'));
    replaceState.mockRestore();
  });

  it('asks for the page and page size the URL names', async () => {
    search.value = 'forms.page=3&forms.pageSize=25';
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    await renderList();
    await waitFor(() => expect(lastFormsQuery()).toMatchObject({ offset: 50, limit: 25 }));
  });

  // A remembered or hand-edited size the API would reject leaves a dead table, so it never ships.
  it('falls back to a valid page size when the URL names one that is not offered', async () => {
    search.value = 'forms.pageSize=999';
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    await renderList();
    await waitFor(() => expect(lastFormsQuery()).toMatchObject({ limit: 10 }));
  });

  it('sorts on the server when a header is clicked', async () => {
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    const view = await renderList();
    await waitFor(() => expect(screen.getByText('Form One')).toBeInTheDocument());

    const replaceState = vi.spyOn(window.history, 'replaceState');
    await act(async () => {
      fireEvent.click(screen.getByTestId('datatable-sort-name'));
    });
    await syncUrl(view);

    await waitFor(() => expect(lastFormsQuery()?.sort).toBe('name:asc'));
    replaceState.mockRestore();
  });

  it('scopes the request to the workspace named in the URL', async () => {
    search.value = 'forms.workspace=ws2';
    seed([
      { id: 'ws1', disclaimerAccepted: true },
      { id: 'ws2', disclaimerAccepted: true },
    ]);
    await renderList();
    await waitFor(() => expect(scopedTo('ws2')).toBe(true));
  });

  // A URL can name a workspace this user cannot see. Reading unscoped would leak another
  // workspace's rows under that filter, so the id has to be resolved before it is sent.
  it('ignores a workspace in the URL that the user cannot see, and says so', async () => {
    search.value = 'forms.workspace=ws-unknown';
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    await renderList();
    await waitFor(() => expect(scopedTo(undefined)).toBe(true));
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
    await waitFor(() => expect(scopedTo('ws2')).toBe(true));
    // The unscoped read must never happen, or another workspace's rows land on screen first.
    expect(scopedTo(undefined)).toBe(false);
  });

  it('does not restore a filter the user cleared', async () => {
    search.value = 'from=nav';
    sessionStorage.setItem('soba.listQuery.forms', JSON.stringify({}));
    seed([
      { id: 'ws1', disclaimerAccepted: true },
      { id: 'ws2', disclaimerAccepted: true },
    ]);
    await renderList();
    await waitFor(() => expect(scopedTo(undefined)).toBe(true));
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
    await waitFor(() => expect(scopedTo('ws2')).toBe(true));

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

    await waitFor(() => expect(scopedTo(undefined)).toBe(true));
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
    await waitFor(() => expect(scopedTo(undefined)).toBe(true));
    expect(scopedTo('ws2')).toBe(false);
    // Visiting a bare link is not a choice, so it must not erase the view set for this tab.
    expect(sessionStorage.getItem('soba.listQuery.forms')).toBe(
      JSON.stringify({ workspace: 'ws2' }),
    );
  });

  it('remembers the filter the URL arrived with', async () => {
    search.value = 'forms.workspace=ws2';
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

  // Losing access to the workspace you had filtered to would otherwise raise the same notice on
  // every arrival from the nav, because the memory keeps handing the id back.
  it('forgets a filter it cannot resolve', async () => {
    search.value = 'forms.workspace=ws-gone';
    sessionStorage.setItem('soba.listQuery.forms', JSON.stringify({ workspace: 'ws-gone' }));
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    await renderList();

    expect(await screen.findByTestId('page-notice-workspace-filter')).toBeInTheDocument();
    await waitFor(() =>
      expect(sessionStorage.getItem('soba.listQuery.forms')).toBe(JSON.stringify({})),
    );
  });

  it('reports an ended session instead of the raw error', async () => {
    const expired = new Error('Session expired');
    expired.name = 'SessionExpiredError';
    getSobaForms.mockRejectedValue(expired);
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    await renderList();
    await waitFor(() => expect(screen.getByText(/Your session has ended\./)).toBeInTheDocument());
  });

  // The backend's string is untranslated and says things like "Request failed (500)".
  it('reports a failed load without showing the backend message', async () => {
    getSobaForms.mockRejectedValue(new Error('Request failed (500)'));
    seed([{ id: 'ws1', disclaimerAccepted: true }]);
    await renderList();

    await waitFor(() => expect(screen.getByText(/Failed to load forms\./)).toBeInTheDocument());
    expect(screen.queryByText(/Request failed/)).not.toBeInTheDocument();
  });

  // Clicking the nav link while already on this page is a query-only navigation: the App Router
  // re-renders rather than remounting, so a mount-only restore never runs.
  it('restores on a nav arrival that does not remount', async () => {
    search.value = 'forms.workspace=ws2';
    seed([
      { id: 'ws1', disclaimerAccepted: true },
      { id: 'ws2', disclaimerAccepted: true },
    ]);
    const view = await renderList();
    await waitFor(() => expect(scopedTo('ws2')).toBe(true));

    const replaceState = vi.spyOn(window.history, 'replaceState');
    search.value = 'from=nav';
    await act(async () => {
      view.rerender(listTree());
    });

    await waitFor(() => expect(lastFormsQuery()?.workspaceId).toBe('ws2'));
    // The marker is consumed on arrival; leaving it in the URL would make a copied link restore
    // the reader's own view.
    expect(replaceState).toHaveBeenCalledWith(null, '', '/en/forms?forms.workspace=ws2');
    replaceState.mockRestore();
  });
});
