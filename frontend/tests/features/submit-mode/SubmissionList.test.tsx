import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    general: { loading: 'Loading...', sessionExpired: 'Your session has ended.' },
    form: { nameLabel: 'Form Name' },
    dataTable: { loadingMessage: 'Loading...', pageOf: 'of {totalPages} page(s)' },
    submission: {
      submissions: 'Submissions',
      empty: 'No submissions found yet.',
      loading: 'Loading submissions...',
      columns: { id: 'Submission ID', formName: 'Form Name', formId: 'Form ID', version: 'Version', status: 'Status' },
    },
  }),
}));

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<unknown>('next/navigation');
  return {
    ...(actual as Record<string, unknown>),
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/en/submissions/f1',
  };
});

const getSobaSubmissions = vi.fn();
vi.mock('@/src/shared/api/sobaApiDesign', () => ({
  getSobaSubmissions: (...args: unknown[]) => getSobaSubmissions(...args),
}));

import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import { SubmissionList } from '@/src/features/submit-mode/ui/SubmissionList';

let store: ReturnType<typeof makeStore>;

async function renderList(props: { formId?: string } = {}) {
  await act(async () => {
    render(
      <Provider store={store}>
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <SubmissionList {...props} />
        </SWRConfig>
      </Provider>,
    );
  });
}

describe('SubmissionList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
    getSobaSubmissions.mockResolvedValue({
      items: [
        { id: 's1', formId: 'f1', formName: 'Form One', versionNo: 2, workflowState: 'submitted' },
        { id: 's2', formId: 'f1', formName: 'Form One', versionNo: 1, workflowState: 'opened' },
      ],
    });
  });

  it('lists the submissions for the form', async () => {
    await renderList({ formId: 'f1' });
    await waitFor(() => expect(screen.getByTestId('submission-view-s1')).toBeInTheDocument());
    expect(getSobaSubmissions).toHaveBeenCalledWith('token', { formId: 'f1' });
  });

  // The endpoint requires a scope anchor and answers 400 without one, so there is no request to
  // make until a form is named.
  it('makes no request without a form', async () => {
    await renderList();
    await waitFor(() => expect(getSobaSubmissions).not.toHaveBeenCalled());
  });

  it('reports an ended session instead of an empty table', async () => {
    const expired = new Error('Session expired');
    expired.name = 'SessionExpiredError';
    getSobaSubmissions.mockRejectedValue(expired);
    await renderList({ formId: 'f1' });
    await waitFor(() =>
      expect(screen.getByText(/Your session has ended\./)).toBeInTheDocument(),
    );
  });
});
