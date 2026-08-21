import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => ({ authenticated: true, token: 'token', initializing: false }),
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    form: {
      loading: 'Loading',
      apiKey: 'API Key',
      nameLabel: 'Form Name',
      descriptionLabel: 'Description',
      noActiveWorkspace: 'Select a workspace before creating a form.',
      noActiveWorkspaceError: 'Select a workspace before saving this form.',
    },
    general: { notAuthenticated: 'Not authed' },
    locale: 'en',
    modal: {
      dialogActions: 'Dialog actions',
    },
  }),
}));

const { mockDispatch, mockWorkspaceState } = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockWorkspaceState: {
    selectedWorkspaceId: 'ws1' as string | null,
    status: 'succeeded' as string,
    workspaces: [{ id: 'ws1' }] as { id: string }[],
    writableWorkspaces: [{ id: 'ws1' }] as { id: string }[],
  },
}));
vi.mock('@/lib/store', () => ({
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({ workspace: mockWorkspaceState, notification: { notifications: [] } }),
  useAppDispatch: () => mockDispatch,
}));

// Mock the soba API functions used by FormForm
vi.mock('@/src/shared/api/sobaApi', () => ({
  getSobaForm: vi.fn().mockResolvedValue({ id: 'f1', name: 'Test', description: '' }),
  getSobaFormVersions: vi.fn().mockResolvedValue({ items: [] }),
  getFormVersionSchema: vi.fn().mockResolvedValue(null),
}));

// Mock DynamicForm and FormDesigner components used in FormForm
vi.mock('@/src/features/formio-v5/ui/DynamicForm', () => ({
  DynamicForm: () => <div data-testid="dynamic-form">preview</div>,
}));
vi.mock('@/src/features/designer/ui/FormDesigner', () => ({
  __esModule: true,
  default: () => <div data-testid="form-designer">designer</div>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  useParams: () => ({ lang: 'en' }),
}));

import FormForm from '@/src/features/designer/ui/FormForm';

describe('FormForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceState.selectedWorkspaceId = 'ws1';
    mockWorkspaceState.status = 'succeeded';
    mockWorkspaceState.workspaces = [{ id: 'ws1' }];
    mockWorkspaceState.writableWorkspaces = [{ id: 'ws1' }];
  });

  it('renders designer tab content when authenticated and not initializing', async () => {
    render(<FormForm formId="f1" />);
    // The designer area includes a form name input; assert it renders with loaded value
    await waitFor(() => expect(screen.getByDisplayValue('Test')).toBeInTheDocument());
  });

  it('blocks new-form designer access when the user has no workspaces', async () => {
    mockWorkspaceState.selectedWorkspaceId = null;
    mockWorkspaceState.workspaces = [];
    mockWorkspaceState.writableWorkspaces = [];
    render(<FormForm />);
    expect(screen.getByTestId('designer-select-workspace')).toBeInTheDocument();
    expect(screen.queryByTestId('form-designer')).not.toBeInTheDocument();
  });
});
