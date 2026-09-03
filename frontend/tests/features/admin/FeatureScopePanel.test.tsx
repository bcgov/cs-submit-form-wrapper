import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';

const { mockFetchFeatureScope, mockUpsertFeatureScope, mockAddNotification, mockPush } = vi.hoisted(
  () => ({
    mockFetchFeatureScope: vi.fn(),
    mockUpsertFeatureScope: vi.fn(),
    mockAddNotification: vi.fn(),
    mockPush: vi.fn(),
  }),
);

vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => ({
    authenticated: true,
    initializing: false,
    token: 'token',
  }),
}));

vi.mock('@/src/shared/api/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: { capabilities: { isSobaAdmin: true } }, loaded: true }),
}));

vi.mock('@/lib/hooks/useNotificationStore', () => ({
  useNotificationStore: () => ({ addNotification: mockAddNotification }),
}));

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<unknown>('next/navigation');
  return {
    ...(actual as Record<string, unknown>),
    useRouter: () => ({ push: mockPush }),
    usePathname: () => '/en/admin/feature-scopes/create',
  };
});

vi.mock('@/src/shared/api/sobaApiAdmin', () => ({
  fetchFeatureScope: (...args: unknown[]) => mockFetchFeatureScope(...args),
  upsertFeatureScope: (...args: unknown[]) => mockUpsertFeatureScope(...args),
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    general: {
      loading: 'Loading…',
      notAuthenticated: 'Not authed',
    },
    admin: {
      forbidden: 'Forbidden',
      featureScopes: {
        heading: 'Feature access',
        createHeading: 'Scope feature access',
        manageHeading: 'Manage feature access',
        intro: 'Enable or disable a scoped feature for a single workspace or form.',
        featureCodeLabel: 'Feature',
        scopeTypeLabel: 'Scope',
        scopeIdLabel: 'Scope ID',
        scopeIdHint: 'The workspace or form UUID the grant applies to.',
        statusLabel: 'Status',
        save: 'Save',
        cancel: 'Cancel',
        saveSuccess: 'Feature access updated.',
        saveError: 'Failed to update feature access.',
        loadError: 'Failed to load feature access.',
        noScopedFeatures: 'No features support per-workspace or per-form grants right now.',
        warningTitle: 'Applies immediately',
        warning: 'Changes take effect on the next request for the selected workspace or form.',
        scopeTypes: { workspace: 'Workspace', form: 'Form' },
        statuses: { active: 'Enabled', inactive: 'Disabled' },
      },
    },
  }),
}));

import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import { FeatureScopePanel } from '@/src/features/admin/ui/FeatureScopePanel';

let store: ReturnType<typeof makeStore>;

const FEATURE_SCOPE_ID = '11111111-1111-4111-8111-111111111111';
const SCOPE_ID = '22222222-2222-4222-8222-222222222222';

const renderPanel = async (props: React.ComponentProps<typeof FeatureScopePanel>) => {
  await act(async () => {
    render(
      <Provider store={store}>
        <SWRConfig
          value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
        >
          <FeatureScopePanel {...props} />
        </SWRConfig>
      </Provider>,
    );
  });
};

describe('FeatureScopePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
    mockFetchFeatureScope.mockResolvedValue({
      id: FEATURE_SCOPE_ID,
      featureCode: 'document-generation-v3',
      scopeType: 'workspace',
      scopeId: SCOPE_ID,
      status: 'inactive',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      createdBy: null,
      updatedBy: null,
    });
    mockUpsertFeatureScope.mockResolvedValue(undefined);
  });

  it('creates a feature scope and returns to the feature access table', async () => {
    await renderPanel({ scopedFeatureCodes: ['document-generation-v3'] });

    await userEvent.type(screen.getByRole('textbox'), SCOPE_ID);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpsertFeatureScope).toHaveBeenCalledWith('token', {
        featureCode: 'document-generation-v3',
        scopeType: 'workspace',
        scopeId: SCOPE_ID,
        status: 'active',
      });
    });
    expect(mockPush).toHaveBeenCalledWith('/en/admin/feature-scopes');
  });

  it('loads an existing feature scope for manage mode', async () => {
    await renderPanel({
      scopedFeatureCodes: ['document-generation-v3'],
      featureScopeId: FEATURE_SCOPE_ID,
    });

    expect(await screen.findByDisplayValue(SCOPE_ID)).toBeInTheDocument();
    expect(mockFetchFeatureScope).toHaveBeenCalledWith('token', FEATURE_SCOPE_ID);
  });

  it('saves status changes in manage mode', async () => {
    await renderPanel({
      scopedFeatureCodes: ['document-generation-v3'],
      featureScopeId: FEATURE_SCOPE_ID,
    });
    await screen.findByDisplayValue(SCOPE_ID);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpsertFeatureScope).toHaveBeenCalledWith('token', {
        featureCode: 'document-generation-v3',
        scopeType: 'workspace',
        scopeId: SCOPE_ID,
        status: 'inactive',
      });
    });
  });

  // Without the record the form would post its defaults, scoping a feature nobody asked for.
  it('withholds the form when the record cannot be loaded', async () => {
    mockFetchFeatureScope.mockRejectedValue(new Error('boom'));

    await renderPanel({
      scopedFeatureCodes: ['document-generation-v3'],
      featureScopeId: FEATURE_SCOPE_ID,
    });

    expect(await screen.findByTestId('feature-scope-load-error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  // The form seeds from the record once and cannot re-seed itself, so a record left in the cache
  // makes the next visit show the status as it was before the last write, and saving there writes
  // that stale status straight back.
  it('does not save a status carried over from a previous visit', async () => {
    const cache = new Map();
    const tree = (
      <Provider store={store}>
        <SWRConfig
          value={{ provider: () => cache, dedupingInterval: 0, shouldRetryOnError: false }}
        >
          <FeatureScopePanel
            scopedFeatureCodes={['document-generation-v3']}
            featureScopeId={FEATURE_SCOPE_ID}
          />
        </SWRConfig>
      </Provider>
    );

    const first = render(tree);
    expect(await screen.findByDisplayValue(SCOPE_ID)).toBeInTheDocument();
    first.unmount();

    // The scope was enabled since that visit, by this admin or another one.
    mockFetchFeatureScope.mockResolvedValue({
      id: FEATURE_SCOPE_ID,
      featureCode: 'document-generation-v3',
      scopeType: 'workspace',
      scopeId: SCOPE_ID,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
      createdBy: null,
      updatedBy: null,
    });

    render(tree);
    await screen.findByDisplayValue(SCOPE_ID);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockUpsertFeatureScope).toHaveBeenCalled());
    expect(mockUpsertFeatureScope).toHaveBeenCalledWith('token', {
      featureCode: 'document-generation-v3',
      scopeType: 'workspace',
      scopeId: SCOPE_ID,
      status: 'active',
    });
  });

  it('returns to the table when cancelled', async () => {
    await renderPanel({ scopedFeatureCodes: ['document-generation-v3'] });

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockPush).toHaveBeenCalledWith('/en/admin/feature-scopes');
  });

  it('does not call the API when no scoped features are available', async () => {
    await renderPanel({ scopedFeatureCodes: [] });

    expect(screen.getByTestId('feature-scope-none')).toBeInTheDocument();
    expect(mockFetchFeatureScope).not.toHaveBeenCalled();
    expect(mockUpsertFeatureScope).not.toHaveBeenCalled();
  });
});
