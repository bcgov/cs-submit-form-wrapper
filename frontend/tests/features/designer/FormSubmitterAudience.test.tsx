import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';
import type { SubmitterAudience } from '@/src/types/groups';
import { ApiError } from '@/src/shared/api/sobaHelpers';

const { mockGet, mockSet } = vi.hoisted(() => ({ mockGet: vi.fn(), mockSet: vi.fn() }));

vi.mock('@/src/shared/api/sobaApiGroups', () => ({
  getSubmitterAudience: mockGet,
  setSubmitterAudience: mockSet,
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    general: { noAccess: 'You do not have access to this.' },
    form: {
      submitterAudienceLabel: 'Who can submit',
      submitterAudiencePublic: 'Public',
      submitterAudienceProtected: 'Protected',
      submitterAudienceProviders: 'Allowed logins',
      submitterAudienceNotSet: 'Not set',
      submitterAudiencePeople: 'people',
      submitterAudienceSave: 'Save',
      submitterAudienceCancel: 'Cancel',
      submitterAudienceLoadError: 'load error',
      submitterAudienceSaveError: 'save error',
    },
  }),
}));

import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import { FormSubmitterAudience } from '@/src/features/designer/ui/FormSubmitterAudience';

let store: ReturnType<typeof makeStore>;

function renderAudience(props: { workspaceId?: string | null; canManage?: boolean } = {}) {
  const { workspaceId = 'ws1', canManage = true } = props;
  return render(
    <Provider store={store}>
      <SWRConfig
        value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
      >
        <FormSubmitterAudience workspaceId={workspaceId} canManage={canManage} />
      </SWRConfig>
    </Provider>,
  );
}

const audience = (over: Partial<SubmitterAudience>): SubmitterAudience => ({
  mode: 'none',
  idps: [],
  users: [],
  available: [{ code: 'azureidir', name: 'IDIR - MFA' }],
  ...over,
});

describe('FormSubmitterAudience summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
  });

  it('shows the protected providers by name', async () => {
    mockGet.mockResolvedValue(audience({ mode: 'protected', idps: ['azureidir'] }));
    renderAudience();
    expect(await screen.findByTestId('submitter-audience-trigger')).toHaveTextContent(
      'Protected (IDIR - MFA)',
    );
  });

  it('shows Public / Not set for the other modes', async () => {
    mockGet.mockResolvedValueOnce(audience({ mode: 'public' }));
    const { unmount } = renderAudience();
    expect(await screen.findByTestId('submitter-audience-trigger')).toHaveTextContent('Public');
    unmount();

    mockGet.mockResolvedValueOnce(audience({ mode: 'none' }));
    renderAudience();
    expect(await screen.findByText('Not set')).toBeInTheDocument();
  });

  it('disables the control for non-managers', async () => {
    mockGet.mockResolvedValue(audience({ mode: 'public' }));
    renderAudience({ canManage: false });
    expect(await screen.findByTestId('submitter-audience-trigger')).toBeDisabled();
  });

  // Reading the audience needs a workspace permission the form's designer need not hold. A refusal
  // is not the same as a failed load.
  it('says no access when the read is refused', async () => {
    mockGet.mockRejectedValue(new ApiError('Forbidden', 403));
    renderAudience();
    expect(await screen.findByText('You do not have access to this.')).toBeInTheDocument();
    expect(screen.queryByText('load error')).not.toBeInTheDocument();
  });

  it('still reports a genuine failure as a load error', async () => {
    mockGet.mockRejectedValue(new ApiError('Boom', 500));
    renderAudience();
    expect(await screen.findByText('load error')).toBeInTheDocument();
  });
});
