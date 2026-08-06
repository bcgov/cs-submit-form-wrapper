import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { useKeycloak as useKeycloakHook } from '@/lib/hooks/useKeycloak';

// Use a mutable keycloakState so tests can set it per-case.
let keycloakState: Partial<ReturnType<typeof useKeycloakHook>> = {
  authenticated: false,
  initializing: true,
};
vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => keycloakState,
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    form: {},
    general: { loading: 'Loading…', loginRequired: 'Login Required' },
  }),
}));

const { mockDispatch } = vi.hoisted(() => ({ mockDispatch: vi.fn() }));
vi.mock('@/lib/store', () => ({
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({ notification: { notifications: [] }, workspace: { activeWorkspaceId: 'ws1' } }),
  useAppDispatch: () => mockDispatch,
}));

import FormDesigner from '@/src/features/designer/ui/FormDesigner';

describe('FormDesigner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the loading indicator when initializing', () => {
    keycloakState = { authenticated: false, initializing: true };
    render(<FormDesigner onUpdateModel={() => {}} initialModel={null} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows login required when not authenticated', () => {
    keycloakState = { authenticated: false, initializing: false };
    render(<FormDesigner onUpdateModel={() => {}} initialModel={null} />);
    expect(screen.getByText('Login Required')).toBeInTheDocument();
  });
});
