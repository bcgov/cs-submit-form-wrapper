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
    form: { nameLabel: 'Form' },
    submission: {
      loading: 'Loading submission...',
      notFound: 'Submission not found.',
      noContent: 'No submitted answers to display.',
      submittedOn: 'Submitted',
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ submissionId: 'sub-1' }),
}));

vi.mock('@/src/features/formio-v5/ui/ReadOnlyFormView', () => ({
  ReadOnlyFormView: () => <div data-testid="submission-view-form">rendered</div>,
}));

const getSubmitSubmission = vi.fn();
const getSubmitSubmissionSchema = vi.fn();
const getSubmitSubmissionData = vi.fn();
vi.mock('@/src/shared/api/sobaApi', () => ({
  getSubmitSubmission: (...args: unknown[]) => getSubmitSubmission(...args),
  getSubmitSubmissionSchema: (...args: unknown[]) => getSubmitSubmissionSchema(...args),
  getSubmitSubmissionData: (...args: unknown[]) => getSubmitSubmissionData(...args),
}));

import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import { SubmissionView } from '@/src/features/submit-mode/ui/SubmissionView';

let store: ReturnType<typeof makeStore>;

async function renderView() {
  await act(async () => {
    render(
      <Provider store={store}>
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <SubmissionView />
        </SWRConfig>
      </Provider>,
    );
  });
}

describe('SubmissionView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    getSubmitSubmission.mockResolvedValue({
      id: 'sub-1',
      formId: 'f1',
      formName: 'Form One',
      versionNo: 3,
      workflowState: 'submitted',
      submittedAt: new Date('2026-01-02T03:04:05Z').toISOString(),
    });
    getSubmitSubmissionSchema.mockResolvedValue({ components: [] });
    getSubmitSubmissionData.mockResolvedValue({ data: { field: 'value' } });
  });

  // A public-audience submission is readable without signing in, so the read must go out with no
  // token rather than waiting for one.
  it('renders for an anonymous reader', async () => {
    await renderView();
    await waitFor(() => expect(screen.getByTestId('submission-view-form')).toBeInTheDocument());
    expect(getSubmitSubmission).toHaveBeenCalledWith(undefined, 'sub-1');
    expect(screen.getByTestId('submission-view-version')).toHaveTextContent('v3');
  });

  it('sends the token when signed in', async () => {
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
    await renderView();
    await waitFor(() => expect(getSubmitSubmission).toHaveBeenCalledWith('token', 'sub-1'));
  });

  it('says not found when the submission does not resolve', async () => {
    getSubmitSubmission.mockRejectedValue(new Error('Request failed (404)'));
    await renderView();
    await waitFor(() =>
      expect(screen.getByTestId('submission-view-notfound')).toBeInTheDocument(),
    );
  });

  // An ended session is not a missing submission; saying "not found" hides why.
  it('distinguishes an ended session from a missing submission', async () => {
    const expired = new Error('Session expired');
    expired.name = 'SessionExpiredError';
    getSubmitSubmission.mockRejectedValue(expired);
    await renderView();
    await waitFor(() =>
      expect(screen.getByTestId('submission-view-session-expired')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('submission-view-notfound')).not.toBeInTheDocument();
  });
});
