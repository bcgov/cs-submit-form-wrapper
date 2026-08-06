import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';

// Mocks
vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: () => ({ authenticated: true, token: 'token', initializing: false }),
}));
vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    general: {
      notAuthenticated: 'Not authed',
      forms: 'Forms',
      selectWorkspace: 'Select a workspace to view forms.',
    },
    form: {
      nameLabel: 'Form Name',
      disclaimerRequired: 'Accept the workspace disclaimer before creating a form.',
    },
    header: {
      selectWorkspace: 'Select Workspace',
    },
    dataTable: {
      loadingMessage: 'Loading...',
      pageOf: 'of {totalPages} page(s)',
    },
    workspaces: {
      workspace: 'Workspace',
    },
    submission: {
      formList: {
        columns: {
          name: 'Name',
          actions: 'Actions',
          createdBy: 'Created By',
          createdAt: 'Created Date',
        },
      },
    },
  }),
}));

const mockPush = vi.fn();
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<unknown>('next/navigation');
  return {
    ...(actual as Record<string, unknown>),
    useRouter: () => ({ push: mockPush }),
    usePathname: () => '/en/designer',
  };
});

vi.mock('@/src/shared/api/sobaApi', () => ({
  getSobaForms: vi.fn().mockResolvedValue({
    items: [
      {
        id: 'f1',
        name: 'Form One',
        status: 'active',
        createdBy: 'alice',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'f2',
        name: 'Form Two',
        status: 'active',
        createdBy: 'bob',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  }),
}));

const { mockWorkspaceState } = vi.hoisted(() => ({
  mockWorkspaceState: {
    activeWorkspaceId: 'ws1' as string | null,
    workspaces: [{ id: 'ws1', disclaimerAccepted: true }] as Array<{
      id: string;
      disclaimerAccepted: boolean;
    }>,
  },
}));
vi.mock('@/lib/store', async () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({ workspace: mockWorkspaceState, notification: { notifications: [] } }),
}));

import FormList from '@/src/features/designer/ui/FormList';
import { selectWorkspace } from '@/src/shared/api/sobaApi';

describe('FormList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceState.activeWorkspaceId = 'ws1';
    mockWorkspaceState.workspaces = [{ id: 'ws1', disclaimerAccepted: true }];
  });

  it('renders the header and search input', async () => {
    await act(async () => {
      render(<FormList />);
    });
    expect(screen.getByRole('heading', { name: 'Forms' })).toBeInTheDocument();
    // DS TextField puts data-testid on its wrapper; query the input by its
    // accessible label instead.
    const input = screen
      .getByTestId('search-forms-text')
      .querySelector('input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it('loads and displays rows from API', async () => {
    await act(async () => {
      render(<FormList />);
    });
    await waitFor(() => expect(screen.getByText('Form One')).toBeInTheDocument());
    expect(screen.getByText('Form Two')).toBeInTheDocument();
  });

  it('disables the Create button when there is no active workspace', async () => {
    mockWorkspaceState.activeWorkspaceId = null;
    await act(async () => {
      render(<FormList />);
    });
    const createBtn = screen.getByTestId('create-form-button');
    expect(createBtn).toBeDisabled();
  });

  it('warns and disables Create when the workspace disclaimer is not accepted', async () => {
    mockWorkspaceState.workspaces = [{ id: 'ws1', disclaimerAccepted: false }];
    await act(async () => {
      render(<FormList />);
    });
    expect(screen.getByTestId('forms-disclaimer-required-alert')).toBeInTheDocument();
    expect(screen.getByTestId('create-form-button')).toBeDisabled();
  });

  it('search works to filter forms', async () => {
    await act(async () => {
      render(<FormList />);
    });
    await waitFor(() => expect(screen.getByText('Form One')).toBeInTheDocument());
    const input = screen
      .getByTestId('search-forms-text')
      .querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'two' } });
    expect(screen.queryByText('Form One')).not.toBeInTheDocument();
    expect(screen.getByText('Form Two')).toBeInTheDocument();
  });
});
