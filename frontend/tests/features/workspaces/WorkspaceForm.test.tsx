import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';

const mockPush = vi.fn();
const { mockCreateWorkspace, mockUpdateWorkspace, mockSelectWorkspace, mockRefreshWorkspaces } =
  vi.hoisted(() => ({
    mockCreateWorkspace: vi.fn(),
    mockUpdateWorkspace: vi.fn(),
    mockSelectWorkspace: vi.fn(),
    mockRefreshWorkspaces: vi.fn().mockResolvedValue([]),
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
      items,
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
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    ),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/en/workspace',
}));

vi.mock('@/src/shared/api/useWorkspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/src/shared/api/useWorkspaces')>()),
  useRefreshWorkspaces: () => mockRefreshWorkspaces,
}));

vi.mock('@/src/shared/api/useCurrentUser', () => ({
  useCurrentUser: () => ({
    data: {
      preferences: { defaultWorkspaceId: 'ws1' },
      capabilities: { canCreateWorkspace: true },
    },
    loaded: true,
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

import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import WorkspaceForm from '@/src/features/workspaces/ui/WorkspaceForm';

let store: ReturnType<typeof makeStore>;

function renderForm(workspaceId?: string) {
  return render(
    <Provider store={store}>
      <SWRConfig
        value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
      >
        <WorkspaceForm workspaceId={workspaceId} />
      </SWRConfig>
    </Provider>,
  );
}

describe('WorkspaceForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
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
      renderForm();
    });
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(mockSelectWorkspace).not.toHaveBeenCalled();
  });

  it('manage mode loads workspace name', async () => {
    await act(async () => {
      renderForm('ws2');
    });
    expect(await screen.findByDisplayValue('Team Workspace')).toBeInTheDocument();
    expect(mockSelectWorkspace).toHaveBeenCalledWith('token', 'ws2');
  });

  it('manage mode shows Settings and Team tabs', async () => {
    await act(async () => {
      renderForm('ws2');
    });
    await waitFor(() => expect(mockSelectWorkspace).toHaveBeenCalled());
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Team' })).toBeInTheDocument();
  });

  it('save on create posts workspace and optional default preference', async () => {
    await act(async () => {
      renderForm();
    });
    await userEvent.type(screen.getByRole('textbox'), 'New Team');
    await userEvent.selectOptions(screen.getByTestId('workspace-your-org'), 'testOrg');
    await userEvent.selectOptions(screen.getByTestId('workspace-use-case'), 'testUseCase');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateWorkspace).toHaveBeenCalledWith('token', {
        name: 'New Team',
        disclaimerAccepted: false,
        useCase: 'testUseCase',
        org: 'testOrg',
      });
      expect(mockRefreshWorkspaces).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/en/workspaces');
    });
  });

  it('save on create sends the disclaimer acceptance', async () => {
    await act(async () => {
      renderForm();
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
      renderForm();
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
  });

  it('cancel navigates back without saving', async () => {
    await act(async () => {
      renderForm();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockCreateWorkspace).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/en/workspaces');
  });

  it('save on manage patches workspace when name changes', async () => {
    await act(async () => {
      renderForm('ws2');
    });
    expect(await screen.findByDisplayValue('Team Workspace')).toBeInTheDocument();
    const nameInput = screen.getByRole('textbox');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateWorkspace).toHaveBeenCalledWith('token', 'ws2', { name: 'Renamed' });
      expect(mockPush).toHaveBeenCalledWith('/en/workspaces');
    });
  });

  // The fields seed once and the record behind them can move on, so sending the whole form would
  // carry the values this person was shown over anything edited elsewhere since.
  it('save on manage sends only the fields that changed', async () => {
    await act(async () => {
      renderForm('ws2');
    });
    expect(await screen.findByDisplayValue('Team Workspace')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('workspace-disclaimer-switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateWorkspace).toHaveBeenCalledWith('token', 'ws2', {
        disclaimerAccepted: true,
      });
    });
  });

  // Without the record the form would post its empty fields as a new workspace.
  it('withholds the form when the workspace cannot be loaded', async () => {
    mockSelectWorkspace.mockRejectedValue(new Error('boom'));

    await act(async () => {
      renderForm('ws2');
    });

    expect(await screen.findByTestId('workspace-load-error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('sends a member who cannot manage the workspace back to the list', async () => {
    mockSelectWorkspace.mockResolvedValue({
      id: 'ws2',
      name: 'Team Workspace',
      kind: 'team',
      role: 'submitter',
      status: 'active',
      disclaimerAccepted: false,
      useCase: 'testUseCase',
      org: 'testOrg',
    });

    await act(async () => {
      renderForm('ws2');
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/en/workspaces'));
    expect(mockUpdateWorkspace).not.toHaveBeenCalled();
  });

  it('refreshes the workspace lists after saving', async () => {
    await act(async () => {
      renderForm('ws2');
    });
    expect(await screen.findByDisplayValue('Team Workspace')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('workspace-disclaimer-switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockRefreshWorkspaces).toHaveBeenCalled());
  });
});
