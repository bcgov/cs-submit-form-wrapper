import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
      schemaNotAvailable: 'Form schema not available.',
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

const { mockWorkspaceState, api, builder } = vi.hoisted(() => ({
  mockWorkspaceState: {
    workspaces: [{ id: 'ws1', disclaimerAccepted: true }] as Workspace[],
    writableWorkspaces: [{ id: 'ws1', disclaimerAccepted: true }] as Workspace[],
    versions: [] as Array<{ id: string; versionNo: number; state: string }>,
    schemas: {} as Record<string, unknown>,
  },
  // Captured so a test can simulate the user editing in the builder.
  builder: { onUpdateModel: null as ((model: unknown) => void) | null },
  api: {
    saveFormVersionSchema: vi.fn().mockResolvedValue({}),
    publishSobaFormVersion: vi.fn().mockResolvedValue({}),
    createFormVersion: vi.fn(),
    createSobaFormioForm: vi.fn(),
    getFormVersionSchema: vi.fn(),
  },
}));

vi.mock('@/src/shared/api/sobaApi', () => ({
  getSobaForm: vi.fn().mockResolvedValue({ id: 'f1', name: 'Test', description: '' }),
  getSobaFormVersions: vi.fn(() => Promise.resolve({ items: mockWorkspaceState.versions })),
  getFormVersionSchema: api.getFormVersionSchema,
  saveFormVersionSchema: api.saveFormVersionSchema,
  publishSobaFormVersion: api.publishSobaFormVersion,
  createFormVersion: api.createFormVersion,
  createSobaFormioForm: api.createSobaFormioForm,
  fetchWorkspaces: vi.fn((_token: string, options: { requiredPermission?: string } = {}) =>
    Promise.resolve({
      items: options.requiredPermission
        ? mockWorkspaceState.writableWorkspaces
        : mockWorkspaceState.workspaces,
    }),
  ),
}));

// Mock DynamicForm and FormDesigner components used in FormForm
vi.mock('@/src/features/formio-v5/ui/DynamicForm', () => ({
  DynamicForm: () => <div data-testid="dynamic-form">preview</div>,
}));
// The real FormDesigner takes its model once at mount and ignores later changes. The stub does the
// same, so a version switch that fails to remount it is visible here.
vi.mock('@/src/features/designer/ui/FormDesigner', () => {
  function FormDesignerStub({
    initialModel,
    onUpdateModel,
  }: {
    initialModel: unknown;
    onUpdateModel: (model: unknown) => void;
  }) {
    const [snapshot] = React.useState(() => JSON.stringify(initialModel));
    builder.onUpdateModel = onUpdateModel;
    return <div data-testid="form-designer">{snapshot}</div>;
  }
  return { __esModule: true, default: FormDesignerStub };
});

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
      <SWRConfig
        value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
      >
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
    mockWorkspaceState.schemas = {};
    api.getFormVersionSchema.mockImplementation((_token: string, versionId: string) =>
      Promise.resolve(mockWorkspaceState.schemas[versionId] ?? { components: [] }),
    );
    api.createFormVersion.mockResolvedValue({ id: 'v-new', versionNo: 3, state: 'draft' });
    builder.onUpdateModel = null;
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

  // The builder is fed its model once at mount. Returning to a version already in the cache
  // produces no loading frame, so the previous version stays on screen unless it is remounted.
  it('shows the right schema when switching back to a cached version', async () => {
    mockWorkspaceState.versions = [
      { id: 'v1', versionNo: 1, state: 'published' },
      { id: 'v2', versionNo: 2, state: 'draft' },
    ];
    mockWorkspaceState.schemas = {
      v1: { components: [{ key: 'from-v1' }] },
      v2: { components: [{ key: 'from-v2' }] },
    };
    renderForm({ formId: 'f1' });

    const picker = (await screen.findByTestId('form-version-select')).querySelector(
      'select',
    ) as HTMLSelectElement;
    await waitFor(() => expect(screen.getByTestId('form-designer')).toHaveTextContent('from-v2'));

    fireEvent.change(picker, { target: { value: 'v1' } });
    await waitFor(() => expect(screen.getByTestId('form-designer')).toHaveTextContent('from-v1'));

    fireEvent.change(picker, { target: { value: 'current' } });
    await waitFor(() => expect(screen.getByTestId('form-designer')).toHaveTextContent('from-v2'));
  });

  // Saving drops the edit overlay. Without writing the saved body into the cache, the next write
  // posts the schema as it was before the edits.
  it('posts the saved schema, not the pre-save one, on a second save', async () => {
    mockWorkspaceState.versions = [{ id: 'v1', versionNo: 1, state: 'draft' }];
    mockWorkspaceState.schemas = { v1: { components: [{ key: 'original' }] } };
    renderForm({ formId: 'f1' });
    await waitFor(() => expect(screen.getByTestId('form-designer')).toHaveTextContent('original'));

    await act(async () => {
      builder.onUpdateModel?.({ components: [{ key: 'edited' }] } as never);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveFormVersionSchema).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveFormVersionSchema).toHaveBeenCalledTimes(2));
    expect(api.saveFormVersionSchema.mock.calls[1][2]).toEqual({
      components: [{ key: 'edited' }],
    });
  });

  it('creates a new version from the saved schema', async () => {
    mockWorkspaceState.versions = [{ id: 'v1', versionNo: 1, state: 'draft' }];
    mockWorkspaceState.schemas = { v1: { components: [{ key: 'original' }] } };
    renderForm({ formId: 'f1' });
    await waitFor(() => expect(screen.getByTestId('form-designer')).toHaveTextContent('original'));

    await act(async () => {
      builder.onUpdateModel?.({ components: [{ key: 'edited' }] } as never);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveFormVersionSchema).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'New Version' }));
    await waitFor(() => expect(api.createFormVersion).toHaveBeenCalled());
    const newVersionCall = api.saveFormVersionSchema.mock.calls.find((c) => c[1] === 'v-new');
    expect(newVersionCall?.[2]).toEqual({ components: [{ key: 'edited' }] });
  });

  // An existing form whose versions have not arrived has no current version. Falling through to
  // the create branch there files the edits under a second form.
  it('never creates a second form for an existing formId', async () => {
    mockWorkspaceState.versions = [];
    renderForm({ formId: 'f1' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.createSobaFormioForm).not.toHaveBeenCalled();
  });

  // The schema key is null until the versions arrive, so a loading flag covering only the schema
  // read reports ready and the designer claims the schema is missing.
  it('shows a spinner, not "schema not available", while the draft assembles', async () => {
    mockWorkspaceState.versions = [{ id: 'v1', versionNo: 1, state: 'draft' }];
    renderForm({ formId: 'f1' });

    expect(screen.queryByText('Form schema not available.')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('form-designer')).toBeInTheDocument());
  });
});
