import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockUseKeycloak } = vi.hoisted(() => ({ mockUseKeycloak: vi.fn() }));

vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => mockUseKeycloak(),
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    general: { notAuthenticated: 'Not authed', loading: 'Loading…' },
    admin: {
      heading: 'Administration',
      forbidden: 'You do not have the platform administrator role required for this section.',
      admins: { heading: 'Platform administrators' },
      featureScopes: { heading: 'Feature access' },
      audits: { heading: 'Document generation' },
    },
  }),
}));

vi.mock('@/src/features/admin/ui/SobaAdminsPanel', () => ({
  SobaAdminsPanel: () => <div data-testid="admins-panel" />,
}));
vi.mock('@/src/features/admin/ui/FeatureScopeListPanel', () => ({
  FeatureScopeListPanel: () => <div data-testid="feature-scope-panel" />,
}));
vi.mock('@/src/features/admin/ui/DocumentGenerationAuditsPanel', () => ({
  DocumentGenerationAuditsPanel: () => <div data-testid="audits-panel" />,
}));

import { AdminDashboard } from '@/src/features/admin/ui/AdminDashboard';

const renderDashboard = async (props?: React.ComponentProps<typeof AdminDashboard>) => {
  await act(async () => {
    render(<AdminDashboard {...props} />);
  });
};

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prompts to sign in when unauthenticated', async () => {
    mockUseKeycloak.mockReturnValue({ authenticated: false, initializing: false });

    await renderDashboard();

    expect(screen.getByText('Not authed')).toBeInTheDocument();
  });

  it('refuses access to a signed-in non-admin', async () => {
    mockUseKeycloak.mockReturnValue({
      authenticated: true,
      initializing: false,
      token: 'token',
      idTokenParsed: { realm_access: { roles: ['user'] } },
    });

    await renderDashboard();

    expect(
      screen.getByText(
        'You do not have the platform administrator role required for this section.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('admins-panel')).not.toBeInTheDocument();
  });

  it('renders document generation administration only when the feature is enabled', async () => {
    mockUseKeycloak.mockReturnValue({
      authenticated: true,
      initializing: false,
      token: 'token',
      idTokenParsed: { realm_access: { roles: ['soba_admin'] } },
    });

    await renderDashboard();

    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByTestId('admins-panel')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Feature access' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Document generation' })).not.toBeInTheDocument();
  });

  it('renders the document generation audit tab for a soba_admin when the feature is enabled', async () => {
    mockUseKeycloak.mockReturnValue({
      authenticated: true,
      initializing: false,
      token: 'token',
      idTokenParsed: { realm_access: { roles: ['soba_admin'] } },
    });

    await renderDashboard({ documentGenerationEnabled: true });

    expect(screen.getByRole('tab', { name: 'Document generation' })).toBeInTheDocument();
  });
});
