import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
      allWorkspaces: 'All Workspaces',
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
    selectedWorkspaceId: null as string | null,
    workspaces: [{ id: 'ws1', disclaimerAccepted: true }] as Array<{
      id: string;
      disclaimerAccepted: boolean;
    }>,
    writableWorkspaces: [{ id: 'ws1', disclaimerAccepted: true }] as Array<{
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
import { PageLayout } from '@/src/components/PageLayout';

describe('FormList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceState.selectedWorkspaceId = null;
    mockWorkspaceState.workspaces = [{ id: 'ws1', disclaimerAccepted: true }];
    mockWorkspaceState.writableWorkspaces = [{ id: 'ws1', disclaimerAccepted: true }];
  });

  // The sole workspace is never "selected" (the picker only renders for two or more), so the
  // gate has to read the workspaces a form could actually be created in.
  it('warns and disables Create when the only workspace has no accepted disclaimer', async () => {
    mockWorkspaceState.workspaces = [{ id: 'ws1', disclaimerAccepted: false }];
    mockWorkspaceState.writableWorkspaces = [{ id: 'ws1', disclaimerAccepted: false }];
    await act(async () => {
      render(
        <PageLayout headingId="forms-heading" heading="Forms">
          <FormList />
        </PageLayout>,
      );
    });
    expect(screen.getByTestId('page-notice-disclaimer')).toBeInTheDocument();
    expect(screen.getByTestId('create-form-button')).toBeDisabled();
  });

  it('allows Create while showing all workspaces when one of them is accepted', async () => {
    mockWorkspaceState.workspaces = [
      { id: 'ws1', disclaimerAccepted: false },
      { id: 'ws2', disclaimerAccepted: true },
    ];
    mockWorkspaceState.writableWorkspaces = [
      { id: 'ws1', disclaimerAccepted: false },
      { id: 'ws2', disclaimerAccepted: true },
    ];
    await act(async () => {
      render(
        <PageLayout headingId="forms-heading" heading="Forms">
          <FormList />
        </PageLayout>,
      );
    });
    expect(screen.queryByTestId('page-notice-disclaimer')).not.toBeInTheDocument();
    expect(screen.getByTestId('create-form-button')).not.toBeDisabled();
  });

  // The picker scopes the list, not the new form's workspace, so it must not gate Create.
  it('keeps Create enabled when the selected workspace is unaccepted but another is not', async () => {
    mockWorkspaceState.selectedWorkspaceId = 'ws1';
    mockWorkspaceState.workspaces = [
      { id: 'ws1', disclaimerAccepted: false },
      { id: 'ws2', disclaimerAccepted: true },
    ];
    mockWorkspaceState.writableWorkspaces = [
      { id: 'ws1', disclaimerAccepted: false },
      { id: 'ws2', disclaimerAccepted: true },
    ];
    await act(async () => {
      render(
        <PageLayout headingId="forms-heading" heading="Forms">
          <FormList />
        </PageLayout>,
      );
    });
    expect(screen.queryByTestId('page-notice-disclaimer')).not.toBeInTheDocument();
    expect(screen.getByTestId('create-form-button')).not.toBeDisabled();
  });

  // Read-only membership is not a creation target, so it must not enable Create either.
  it('disables Create when the user has no workspace they can create in', async () => {
    mockWorkspaceState.workspaces = [{ id: 'ws1', disclaimerAccepted: true }];
    mockWorkspaceState.writableWorkspaces = [];
    await act(async () => {
      render(
        <PageLayout headingId="forms-heading" heading="Forms">
          <FormList />
        </PageLayout>,
      );
    });
    expect(screen.queryByTestId('page-notice-disclaimer')).not.toBeInTheDocument();
    expect(screen.getByTestId('create-form-button')).toBeDisabled();
  });

  it('renders the search input', async () => {
    await act(async () => {
      render(
        <PageLayout headingId="forms-heading" heading="Forms">
          <FormList />
        </PageLayout>,
      );
    });
    // DS TextField puts data-testid on its wrapper; query the input by its
    // accessible label instead.
    const input = screen
      .getByTestId('search-forms-text')
      .querySelector('input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it('loads and displays rows from API', async () => {
    await act(async () => {
      render(
        <PageLayout headingId="forms-heading" heading="Forms">
          <FormList />
        </PageLayout>,
      );
    });
    await waitFor(() => expect(screen.getByText('Form One')).toBeInTheDocument());
    expect(screen.getByText('Form Two')).toBeInTheDocument();
  });

  it('search works to filter forms', async () => {
    await act(async () => {
      render(
        <PageLayout headingId="forms-heading" heading="Forms">
          <FormList />
        </PageLayout>,
      );
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
