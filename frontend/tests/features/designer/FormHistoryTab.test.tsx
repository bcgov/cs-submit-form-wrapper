import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';

const { mockGetVersionPage, dict } = vi.hoisted(() => ({
  mockGetVersionPage: vi.fn(),
  dict: {
    locale: 'en',
    general: { loading: 'Loading...', version: 'Version', forms: 'Forms' },
    dataTable: { itemName: 'items', pageOf: 'of {totalPages} page(s)' },
    header: { design: 'Design' },
    form: { status: 'Status', newVersionFrom: 'New version from', emptyHistory: 'No versions yet.' },
    submission: {
      formList: { columns: { createdBy: 'Created By', createdAt: 'Created Date' } },
    },
  },
}));

vi.mock('@/src/shared/api/sobaApi', () => ({
  getSobaFormVersionPage: (...args: unknown[]) => mockGetVersionPage(...args),
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => dict,
}));

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<unknown>('next/navigation');
  return {
    ...(actual as Record<string, unknown>),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => '/en/designer/f1',
    useSearchParams: () => new URLSearchParams(''),
  };
});

import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import FormHistoryTab from '@/src/features/designer/ui/FormHistoryTab';
import type { Dictionary } from '@/src/types/plugins';

const version = (id: string, versionNo: number, state = 'draft') => ({
  id,
  versionNo,
  state,
  engineSyncStatus: 'synced',
  currentRevisionNo: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
});

let store: ReturnType<typeof makeStore>;

function renderTab(onSelectVersion = vi.fn()) {
  render(
    <Provider store={store}>
      <SWRConfig
        value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
      >
        <FormHistoryTab
          dict={dict as unknown as Dictionary}
          formId="f1"
          onSelectVersion={onSelectVersion}
          onRestoreVersion={vi.fn(() => Promise.resolve())}
        />
      </SWRConfig>
    </Provider>,
  );
  return onSelectVersion;
}

describe('FormHistoryTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
    mockGetVersionPage.mockResolvedValue({
      items: [version('v9', 9)],
      page: { offset: 0, limit: 10, total: 42 },
    });
  });

  it('asks for one page, newest version first', async () => {
    await act(async () => {
      renderTab();
    });

    await waitFor(() =>
      expect(mockGetVersionPage).toHaveBeenCalledWith('token', {
        formId: 'f1',
        offset: 0,
        limit: 10,
        sort: 'versionNo:desc',
      }),
    );
  });

  it('pages against the total the server reports', async () => {
    await act(async () => {
      renderTab();
    });

    expect(await screen.findByText(/of 5 page\(s\)/)).toBeInTheDocument();
  });

  // A column the endpoint can sort on is only reachable if its header is a control. The sort
  // itself travels in the URL, which useListQuery covers.
  it('offers the sorts the endpoint declares as headers', async () => {
    await act(async () => {
      renderTab();
    });
    await screen.findByTestId('v9-status-tag');

    expect(screen.getByRole('button', { name: 'Version' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Created Date' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Created By' })).not.toBeInTheDocument();
  });

  // The picker carries only the newest versions, so a row further down the history is the case
  // that has to keep working.
  it('opens a version that only the table holds', async () => {
    const onSelectVersion = renderTab();
    await screen.findByTestId('v9-design-link');

    await userEvent.click(screen.getByTestId('v9-design-link'));

    expect(onSelectVersion).toHaveBeenCalledWith('v9');
  });
});
