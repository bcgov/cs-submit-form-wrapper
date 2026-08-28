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
      disclaimerRequired: 'Accept the workspace disclaimer before creating a form.',
    },
    general: { notAuthenticated: 'Not authed' },
    workspaces: { workspace: 'Workspace' },
    locale: 'en',
    modal: {
      dialogActions: 'Dialog actions',
    },
  }),
}));

type Workspace = { id: string; name?: string; kind?: string; disclaimerAccepted: boolean };

const { mockWorkspaceState } = vi.hoisted(() => ({
  mockWorkspaceState: {
    workspaces: [{ id: 'ws1', disclaimerAccepted: true }] as Workspace[],
    writableWorkspaces: [{ id: 'ws1', disclaimerAccepted: true }] as Workspace[],
  },
}));

// Mock the soba API functions used by FormForm
vi.mock('@/src/shared/api/sobaApi', () => ({
  getSobaForm: vi.fn().mockResolvedValue({ id: 'f1', name: 'Test', description: '' }),
  getSobaFormVersions: vi.fn().mockResolvedValue({ items: [] }),
  getFormVersionSchema: vi.fn().mockResolvedValue(null),
  fetchWorkspaces: vi.fn((_token: string, requiredPermission?: string) =>
    Promise.resolve({
      items: requiredPermission ? mockWorkspaceState.writableWorkspaces : mockWorkspaceState.workspaces,
    }),
  ),
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

import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';
import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import FormForm from '@/src/features/designer/ui/FormForm';

let store: ReturnType<typeof makeStore>;

function renderForm(props: { formId?: string } = {}) {
  return render(
    <Provider store={store}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <FormForm {...props} />
      </SWRConfig>
    </Provider>,
  );
}

describe('FormForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
    mockWorkspaceState.workspaces = [{ id: 'ws1', disclaimerAccepted: true }];
    mockWorkspaceState.writableWorkspaces = [{ id: 'ws1', disclaimerAccepted: true }];
  });

  it('renders designer tab content when authenticated and not initializing', async () => {
    renderForm({ formId: 'f1' });
    // The designer area includes a form name input; assert it renders with loaded value
    await waitFor(() => expect(screen.getByDisplayValue('Test')).toBeInTheDocument());
  });

  it('blocks new-form designer access when the user has no workspaces', async () => {
    mockWorkspaceState.workspaces = [];
    mockWorkspaceState.writableWorkspaces = [];
    renderForm();
    expect(await screen.findByTestId('designer-select-workspace')).toBeInTheDocument();
    expect(screen.queryByTestId('form-designer')).not.toBeInTheDocument();
  });

  // A picker that disappears reads as a missing feature, so it shows even for a single choice,
  // and the workspace a form lands in is always an explicit choice — never preselected.
  it('shows the workspace picker unselected even with one creatable workspace', async () => {
    mockWorkspaceState.workspaces = [
      { id: 'ws1', name: 'Alpha', kind: 'team', disclaimerAccepted: true },
    ];
    mockWorkspaceState.writableWorkspaces = [
      { id: 'ws1', name: 'Alpha', kind: 'team', disclaimerAccepted: true },
    ];
    renderForm();

    const picker = await screen.findByTestId('workspace-select');
    expect(picker.querySelector('select')).toHaveValue('');
    expect(screen.getAllByText('Alpha (team)').length).toBeGreaterThan(0);
  });

  // The forms-list filter scopes what you are viewing, not where a new form belongs.
  it('does not preselect the workspace chosen in the forms-list filter', async () => {
    mockWorkspaceState.workspaces = [
      { id: 'ws1', name: 'Alpha', kind: 'team', disclaimerAccepted: true },
      { id: 'ws2', name: 'Beta', kind: 'team', disclaimerAccepted: true },
    ];
    mockWorkspaceState.writableWorkspaces = [
      { id: 'ws1', name: 'Alpha', kind: 'team', disclaimerAccepted: true },
      { id: 'ws2', name: 'Beta', kind: 'team', disclaimerAccepted: true },
    ];
    renderForm();

    const picker = await screen.findByTestId('workspace-select');
    expect(picker.querySelector('select')).toHaveValue('');
  });

  // Create permission without an accepted disclaimer is actionable, so it gets its own message.
  it('blocks new-form designer access when no workspace has an accepted disclaimer', async () => {
    mockWorkspaceState.workspaces = [{ id: 'ws1', disclaimerAccepted: false }];
    mockWorkspaceState.writableWorkspaces = [{ id: 'ws1', disclaimerAccepted: false }];
    renderForm();
    expect(await screen.findByTestId('disclaimer-required-alert')).toBeInTheDocument();
    expect(screen.queryByTestId('form-designer')).not.toBeInTheDocument();
  });
});
