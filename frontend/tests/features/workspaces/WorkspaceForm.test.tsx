import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
const { mockCreateWorkspace, mockUpdateWorkspace, mockSelectWorkspace, mockDispatch, mockUnwrap } =
  vi.hoisted(() => ({
    mockCreateWorkspace: vi.fn(),
    mockUpdateWorkspace: vi.fn(),
    mockSelectWorkspace: vi.fn(),
    mockDispatch: vi.fn(),
    mockUnwrap: vi.fn().mockResolvedValue({}),
  }));

vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => ({ authenticated: true, token: 'token', initializing: false }),
}));

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    general: {
      notAuthenticated: 'Not authed',
      loading: 'Loading…',
    },
    ministries: {
      testOrg: 'Test Org',
    },
    useCases: {
      testUseCase: 'Test Use Case',
    },
    workspaces: {
      createHeading: 'Create Workspace',
      manageHeading: 'Manage Workspace',
      settingsTab: 'Settings',
      teamTab: 'Team',
      nameLabel: 'Name',
      save: 'Save',
      create: 'Create',
      cancel: 'Cancel',
      saveError: 'Failed to save workspace.',
      createError: 'Failed to create workspace.',
      loadError: 'Failed to load workspace.',
      manageForbidden: 'Only workspace owners or admins can manage this workspace.',
      createForbidden: 'Only BC Government identity provider users can create workspaces.',
      defaultWorkspaceFormLabel: 'Set as default workspace',
      disclaimerLabel: 'I agree to the disclaimer and statement of responsibility',
    },
  }),
}));

vi.mock('@bcgov/design-system-react-components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bcgov/design-system-react-components')>();
  
  type SelectItem = { id: string | number; label: string };
  
  return {
    ...actual,
    Select: ({ 
      'data-testid': testId, 
      value, 
      onChange, 
      items 
    }: {
      'data-testid'?: string;
      value?: string | number | null;
      onChange?: (val: string) => void;
      items?: SelectItem[];
    }) => (
      <select
        data-testid={testId}
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        aria-label={testId}
      >
        <option value="">Select...</option>
        {items?.map((item) => (
          <option key={item.id} value={item.id}>{item.label}</option>
        ))}
      </select>
    ),
  };
});


vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/en/workspace',
}));

vi.mock('@/lib/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({
      currentUser: {
        data: {
          preferences: { defaultWorkspaceId: 'ws1' },
          capabilities: { canCreateWorkspace: true },
        },
        status: 'succeeded',
      },
      workspace: {
        status: 'succeeded',
        workspaces: [{ id: 'ws1', role: 'owner' }],
      },
    }),
}));

vi.mock('@/lib/hooks/useNotificationStore', () => ({
  useNotificationStore: () => ({ addNotification: vi.fn() }),
}));

vi.mock('@/src/shared/api/sobaApi', () => ({
  createWorkspace: mockCreateWorkspace,
  updateWorkspace: mockUpdateWorkspace,
  selectWorkspace: mockSelectWorkspace,
}));

import WorkspaceForm from '@/src/features/workspaces/ui/WorkspaceForm';

describe('WorkspaceForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: mockUnwrap });
    mockCreateWorkspace.mockResolvedValue({
      id: 'ws-new',
      name: 'New Team',
      kind: 'team',
      role: 'owner',
      status: 'active',
    });
    mockSelectWorkspace.mockResolvedValue({
      id: 'ws2',
      name: 'Team Workspace',
      kind: 'team',
      role: 'owner',
      status: 'active',
      disclaimerAccepted: false,
      useCase: 'testUseCase',
      org: 'testOrg',
    });
    mockUpdateWorkspace.mockResolvedValue({
      id: 'ws2',
      name: 'Renamed',
      kind: 'team',
      role: 'owner',
      status: 'active',
      disclaimerAccepted: false,
      useCase: 'testUseCase',
      org: 'testOrg',
    });
  });

  it('create mode renders empty name and does not load workspace', async () => {
    await act(async () => {
      render(<WorkspaceForm />);
    });
    expect(screen.getByRole('heading', { name: 'Create Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(mockSelectWorkspace).not.toHaveBeenCalled();
  });

  it('manage mode loads workspace name', async () => {
    await act(async () => {
      render(<WorkspaceForm workspaceId="ws2" />);
    });
    await waitFor(() => expect(screen.getByDisplayValue('Team Workspace')).toBeInTheDocument());
    expect(mockSelectWorkspace).toHaveBeenCalledWith('token', 'ws2');
  });

  it('manage mode shows Settings and Team tabs', async () => {
    await act(async () => {
      render(<WorkspaceForm workspaceId="ws2" />);
    });
    await waitFor(() => expect(mockSelectWorkspace).toHaveBeenCalled());
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Team' })).toBeInTheDocument();
  });

  it('save on create posts workspace and optional default preference', async () => {
    await act(async () => {
      render(<WorkspaceForm />);
    });
    await userEvent.type(screen.getByRole('textbox'), 'New Team');
    await userEvent.selectOptions(screen.getByTestId('workspace-your-org'), 'testOrg');
    await userEvent.selectOptions(screen.getByTestId('workspace-use-case'), 'testUseCase');
    await userEvent.click(screen.getByTestId('workspace-default-switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateWorkspace).toHaveBeenCalledWith('token', {
        name: 'New Team',
        disclaimerAccepted: false,
        useCase: 'testUseCase',
        org: 'testOrg',
      });
      expect(mockDispatch).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/en/workspaces');
    });
  });

  it('save on create sends the disclaimer acceptance', async () => {
    await act(async () => {
      render(<WorkspaceForm />);
    });
    await userEvent.type(screen.getByRole('textbox'), 'New Team');
    await userEvent.selectOptions(screen.getByTestId('workspace-your-org'), 'testOrg');
    await userEvent.selectOptions(screen.getByTestId('workspace-use-case'), 'testUseCase');
    await userEvent.click(screen.getByTestId('workspace-disclaimer-switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateWorkspace).toHaveBeenCalledWith('token', {
        name: 'New Team',
        disclaimerAccepted: true,
        useCase: 'testUseCase',
        org: 'testOrg',
      });
    });
  });

  it('create without toggling default preserves the existing default', async () => {
    // currentUser already has defaultWorkspaceId 'ws1'. Creating a second workspace
    // without touching the switch must NOT PATCH /me (which would clear the default).
    await act(async () => {
      render(<WorkspaceForm />);
    });
    await userEvent.type(screen.getByRole('textbox'), 'Second Team');
    await userEvent.selectOptions(screen.getByTestId('workspace-your-org'), 'testOrg');
    await userEvent.selectOptions(screen.getByTestId('workspace-use-case'), 'testUseCase');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateWorkspace).toHaveBeenCalledWith('token', {
        name: 'Second Team',
        disclaimerAccepted: false,
        useCase: 'testUseCase',
        org: 'testOrg',
      });
      expect(mockPush).toHaveBeenCalledWith('/en/workspaces');
    });
    // Only updateDefaultWorkspace calls .unwrap(); loadWorkspaces does not.
    expect(mockUnwrap).not.toHaveBeenCalled();
  });

  it('cancel navigates back without saving', async () => {
    await act(async () => {
      render(<WorkspaceForm />);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockCreateWorkspace).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/en/workspaces');
  });

  it('save on manage patches workspace when name changes', async () => {
    await act(async () => {
      render(<WorkspaceForm workspaceId="ws2" />);
    });
    await waitFor(() => expect(screen.getByDisplayValue('Team Workspace')).toBeInTheDocument());
    const nameInput = screen.getByRole('textbox');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateWorkspace).toHaveBeenCalledWith('token', 'ws2', {
        name: 'Renamed',
        disclaimerAccepted: false,
        useCase: 'testUseCase',
        org: 'testOrg',
      });
      expect(mockPush).toHaveBeenCalledWith('/en/workspaces');
    });
  });

  it('save on manage sends the disclaimer acceptance', async () => {
    await act(async () => {
      render(<WorkspaceForm workspaceId="ws2" />);
    });
    await waitFor(() => expect(screen.getByDisplayValue('Team Workspace')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('workspace-disclaimer-switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateWorkspace).toHaveBeenCalledWith('token', 'ws2', {
        name: 'Team Workspace',
        disclaimerAccepted: true,
        useCase: 'testUseCase',
        org: 'testOrg',
      });
    });
  });
});
