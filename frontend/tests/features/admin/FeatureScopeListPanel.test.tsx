import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  mockFetchFeatureScopes,
  mockRemoveFeatureScope,
  mockUpsertFeatureScope,
  mockAddNotification,
  mockPush,
} = vi.hoisted(() => ({
  mockFetchFeatureScopes: vi.fn(),
  mockRemoveFeatureScope: vi.fn(),
  mockUpsertFeatureScope: vi.fn(),
  mockAddNotification: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => ({ authenticated: true, token: 'token', initializing: false }),
}));

vi.mock('@/lib/hooks/useNotificationStore', () => ({
  useNotificationStore: () => ({ addNotification: mockAddNotification }),
}));

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<unknown>('next/navigation');
  return {
    ...(actual as Record<string, unknown>),
    useRouter: () => ({ push: mockPush }),
    usePathname: () => '/en/admin/feature-scopes',
  };
});

vi.mock('@/src/shared/api/sobaApiAdmin', () => ({
  fetchFeatureScopes: (...args: unknown[]) => mockFetchFeatureScopes(...args),
  removeFeatureScope: (...args: unknown[]) => mockRemoveFeatureScope(...args),
  upsertFeatureScope: (...args: unknown[]) => mockUpsertFeatureScope(...args),
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    general: { loading: 'Loading…', cancel: 'Cancel' },
    dataTable: { itemName: 'items', pageOf: 'of {totalPages} page(s)' },
    modal: { dialogActions: 'Dialog actions' },
    admin: {
      truncated: 'Showing the first {limit}. Narrow the filters to see the rest.',
      featureScopes: {
        deleteConfirmTitle: 'Delete feature access',
        deleteConfirmMessage:
          '{featureCode} stops being available to this {scopeType} immediately.',
        heading: 'Feature access',
        intro: 'Enable or disable a scoped feature for a single workspace or form.',
        featureCodeLabel: 'Feature',
        create: 'Scope feature',
        manage: 'Manage',
        delete: 'Delete',
        saveSuccess: 'Feature access updated.',
        saveError: 'Failed to update feature access.',
        loadError: 'Failed to load feature access.',
        deleteSuccess: 'Feature access deleted.',
        deleteError: 'Failed to delete feature access.',
        empty: 'No feature access grants found.',
        noScopedFeatures: 'No features support per-workspace or per-form grants right now.',
        statusToggleLabel: 'Toggle {featureCode} for {scopeType} {scopeId}',
        columns: {
          feature: 'Feature',
          scope: 'Scope',
          scopeId: 'Scope ID',
          status: 'Status',
          updated: 'Updated',
          actions: 'Actions',
        },
        scopeTypes: { workspace: 'Workspace', form: 'Form' },
      },
    },
  }),
}));

import { FeatureScopeListPanel } from '@/src/features/admin/ui/FeatureScopeListPanel';

const FEATURE_SCOPE = {
  id: '11111111-1111-4111-8111-111111111111',
  featureCode: 'document-generation-v3',
  scopeType: 'workspace' as const,
  scopeId: '22222222-2222-4222-8222-222222222222',
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  createdBy: null,
  updatedBy: null,
};

const HIDDEN_FEATURE_SCOPE = {
  ...FEATURE_SCOPE,
  id: '33333333-3333-4333-8333-333333333333',
  featureCode: 'disabled-feature',
};

describe('FeatureScopeListPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchFeatureScopes.mockResolvedValue({
      items: [FEATURE_SCOPE, HIDDEN_FEATURE_SCOPE],
      page: { limit: 200, hasMore: false },
    });
    mockRemoveFeatureScope.mockResolvedValue(undefined);
    mockUpsertFeatureScope.mockResolvedValue(undefined);
  });

  it('lists administrable feature scopes and filters out unavailable feature codes', async () => {
    await act(async () => {
      render(<FeatureScopeListPanel scopedFeatureCodes={['document-generation-v3']} />);
    });

    expect(await screen.findByText('document-generation-v3')).toBeInTheDocument();
    expect(screen.getByText(FEATURE_SCOPE.scopeId)).toBeInTheDocument();
    expect(screen.queryByText('disabled-feature')).not.toBeInTheDocument();
  });

  it('routes to create and manage pages', async () => {
    await act(async () => {
      render(<FeatureScopeListPanel scopedFeatureCodes={['document-generation-v3']} />);
    });
    await screen.findByText('document-generation-v3');

    await userEvent.click(screen.getByRole('button', { name: 'Scope feature' }));
    expect(mockPush).toHaveBeenCalledWith('/en/admin/feature-scopes/create');

    await userEvent.click(screen.getByTestId(`manage-feature-scope-${FEATURE_SCOPE.id}`));
    expect(mockPush).toHaveBeenCalledWith(`/en/admin/feature-scopes/${FEATURE_SCOPE.id}`);
  });

  it('toggles feature-scope status in place', async () => {
    await act(async () => {
      render(<FeatureScopeListPanel scopedFeatureCodes={['document-generation-v3']} />);
    });
    await screen.findByText('document-generation-v3');

    await userEvent.click(screen.getByTestId(`feature-scope-status-${FEATURE_SCOPE.id}`));

    await waitFor(() => {
      expect(mockUpsertFeatureScope).toHaveBeenCalledWith('token', {
        featureCode: FEATURE_SCOPE.featureCode,
        scopeType: FEATURE_SCOPE.scopeType,
        scopeId: FEATURE_SCOPE.scopeId,
        status: 'inactive',
      });
    });
  });

  it('deletes a feature scope from the table', async () => {
    await act(async () => {
      render(<FeatureScopeListPanel scopedFeatureCodes={['document-generation-v3']} />);
    });
    await screen.findByText('document-generation-v3');

    await userEvent.click(screen.getByTestId(`delete-feature-scope-${FEATURE_SCOPE.id}`));
    await userEvent.click(await screen.findByTestId('confirm-modal-confirm'));

    await waitFor(() => {
      expect(mockRemoveFeatureScope).toHaveBeenCalledWith('token', FEATURE_SCOPE.id);
    });
    await waitFor(() => {
      expect(screen.queryByText('document-generation-v3')).not.toBeInTheDocument();
    });
  });

  // Irreversible, so the row action only opens the prompt.
  it('does not delete until the prompt is confirmed', async () => {
    await act(async () => {
      render(<FeatureScopeListPanel scopedFeatureCodes={['document-generation-v3']} />);
    });
    await screen.findByText('document-generation-v3');

    await userEvent.click(screen.getByTestId(`delete-feature-scope-${FEATURE_SCOPE.id}`));
    expect(mockRemoveFeatureScope).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByTestId('confirm-modal-cancel'));

    expect(mockRemoveFeatureScope).not.toHaveBeenCalled();
    expect(screen.getByText('document-generation-v3')).toBeInTheDocument();
  });

  it('reports a list the server cut short', async () => {
    mockFetchFeatureScopes.mockResolvedValue({
      items: [FEATURE_SCOPE],
      page: { limit: 200, hasMore: true },
    });

    await act(async () => {
      render(<FeatureScopeListPanel scopedFeatureCodes={['document-generation-v3']} />);
    });

    expect(await screen.findByTestId('feature-scope-truncated')).toBeInTheDocument();
  });

  it('does not render the table when no scoped features are available', async () => {
    await act(async () => {
      render(<FeatureScopeListPanel scopedFeatureCodes={[]} />);
    });

    expect(screen.getByTestId('feature-scope-none')).toBeInTheDocument();
    expect(screen.queryByText('document-generation-v3')).not.toBeInTheDocument();
  });
});
