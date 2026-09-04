import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';

const { mockFetchAudits, mockAddNotification } = vi.hoisted(() => ({
  mockFetchAudits: vi.fn(),
  mockAddNotification: vi.fn(),
}));

vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => ({ authenticated: true, initializing: false, token: 'token' }),
}));

vi.mock('@/lib/hooks/useNotificationStore', () => ({
  useNotificationStore: () => ({ addNotification: mockAddNotification }),
}));

vi.mock('@/src/shared/api/sobaApiAdmin', () => ({
  fetchDocumentGenerationAudits: (...args: unknown[]) => mockFetchAudits(...args),
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    general: { loading: 'Loading', search: 'Search' },
    dataTable: {
      emptyMessage: 'No items found.',
      loadingMessage: 'Loading...',
      itemName: 'items',
      itemsPerPage: 'Items per page:',
      itemsPerPageAria: 'Items per page',
      pageAria: 'Page',
      pageOf: 'of {totalPages} page(s)',
      previousPage: 'Previous page',
      nextPage: 'Next page',
      of: 'of',
    },
    admin: {
      audits: {
        heading: 'Document generation',
        intro: 'Recent document generation calls for a workspace or form.',
        workspaceIdLabel: 'Workspace ID',
        formIdLabel: 'Form ID',
        prompt: 'Enter a workspace or form ID to view recent activity.',
        empty: 'No document generation activity found.',
        loadError: 'Failed to load document generation activity.',
        columns: {
          createdAt: 'When',
          outcome: 'Outcome',
          mode: 'Mode',
          backend: 'Backend',
          duration: 'Duration',
          detail: 'Detail',
          submission: 'Submission',
        },
      },
    },
  }),
}));

import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import { DocumentGenerationAuditsPanel } from '@/src/features/admin/ui/DocumentGenerationAuditsPanel';

let store: ReturnType<typeof makeStore>;

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<unknown>('next/navigation');
  return {
    ...(actual as Record<string, unknown>),
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/en/admin',
    useSearchParams: () => new URLSearchParams(''),
  };
});

const WORKSPACE_ID = '01a059a2-5782-75ee-b107-1d1eeceb4871';

const renderPanel = async () => {
  await act(async () => {
    render(
      <Provider store={store}>
        <SWRConfig
          value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
        >
          <DocumentGenerationAuditsPanel />
        </SWRConfig>
      </Provider>,
    );
  });
};

const searchButton = () => screen.getByRole('button', { name: 'Search' });

describe('DocumentGenerationAuditsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
    mockFetchAudits.mockResolvedValue({ items: [], page: { offset: 0, limit: 10, total: 0 } });
  });

  it('cannot search with both fields empty', async () => {
    await renderPanel();

    expect(searchButton()).toBeDisabled();
  });

  it('searches on a single scope id', async () => {
    await renderPanel();

    await userEvent.type(screen.getByLabelText('Workspace ID'), WORKSPACE_ID);
    await userEvent.click(searchButton());

    await waitFor(() => {
      expect(mockFetchAudits).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({ workspaceId: WORKSPACE_ID, formId: undefined }),
      );
    });
  });

  // Both ids go on the request, so a malformed one the user did fill in would 400 the whole call.
  it('cannot search when a filled id is not a uuid', async () => {
    await renderPanel();

    await userEvent.type(screen.getByLabelText('Workspace ID'), WORKSPACE_ID);
    await userEvent.type(screen.getByLabelText('Form ID'), 'not-a-uuid');

    expect(searchButton()).toBeDisabled();
    expect(mockFetchAudits).not.toHaveBeenCalled();
  });

  // An empty table reads as "no activity", which is a different answer from "the call failed".
  it('reports a failed search instead of showing an empty table', async () => {
    mockFetchAudits.mockRejectedValue(new Error('Invalid request query'));

    await renderPanel();

    await userEvent.type(screen.getByLabelText('Workspace ID'), WORKSPACE_ID);
    await userEvent.click(searchButton());

    expect(
      await screen.findByText(/Failed to load document generation activity\./),
    ).toBeInTheDocument();
    expect(screen.queryByText('No document generation activity found.')).not.toBeInTheDocument();
  });
});
