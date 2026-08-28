import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

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
    versions: [] as Array<{ id: string; versionNo: number; state: string }>,
  },
}));

// Mock the soba API functions used by FormForm
vi.mock('@/src/shared/api/sobaApi', () => ({
  getSobaForm: vi.fn().mockResolvedValue({ id: 'f1', name: 'Test', description: '' }),
  getSobaFormVersions: vi.fn(() =>
    Promise.resolve({ items: mockWorkspaceState.versions }),
  ),
  getFormVersionSchema: vi.fn().mockResolvedValue({ components: [] }),
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
import { PageLayout } from '@/src/components/PageLayout';

let store: ReturnType<typeof makeStore>;

function renderForm(props: { formId?: string } = {}) {
  return render(
    <Provider store={store}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <PageLayout headingId="designer-heading" heading="Form Designer">
          <FormForm {...props} />
        </PageLayout>
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
    mockWorkspaceState.versions = [];
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

  // The highest versionNo is the current one, and its schema is what the builder is fed.
  it('reads the schema of the current version', async () => {
    mockWorkspaceState.versions = [
      { id: 'v1', versionNo: 1, state: 'published' },
      { id: 'v2', versionNo: 2, state: 'draft' },
    ];
    renderForm({ formId: 'f1' });

    const { getFormVersionSchema } = await import('@/src/shared/api/sobaApi');
    await waitFor(() => expect(getFormVersionSchema).toHaveBeenCalledWith('token', 'v2'));
    expect(getFormVersionSchema).not.toHaveBeenCalledWith('token', 'v1');
  });

  // The loaded name is server truth and the typed one is the user's unsaved edit. A re-read must
  // never win over what has been typed.
  it('keeps a typed name over the loaded one', async () => {
    renderForm({ formId: 'f1' });
    const input = (await screen.findByDisplayValue('Test')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed' } });
    expect(await screen.findByDisplayValue('Renamed')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Test')).not.toBeInTheDocument();
  });

  // Switching versions changes which schema is read, and the read-only notice explains why save is
  // off. Selecting the current draft again returns to it.
  it('reads the selected version schema when switching to history', async () => {
    mockWorkspaceState.versions = [
      { id: 'v1', versionNo: 1, state: 'published' },
      { id: 'v2', versionNo: 2, state: 'draft' },
    ];
    renderForm({ formId: 'f1' });

    const { getFormVersionSchema } = await import('@/src/shared/api/sobaApi');
    await waitFor(() => expect(getFormVersionSchema).toHaveBeenCalledWith('token', 'v2'));

    const picker = (await screen.findByTestId('form-version-select')).querySelector(
      'select',
    ) as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: 'v1' } });

    await waitFor(() => expect(getFormVersionSchema).toHaveBeenCalledWith('token', 'v1'));
    expect(await screen.findByTestId('page-notice-history-view')).toBeInTheDocument();
  });
});
