import { describe, it, expect } from 'vitest';
import type { FormType } from '@formio/react';
import formReducer, {
  clearFormState,
  setFormName,
  setFormDesc,
  setFormWorkspaceId,
  setFormSchema,
  setFormDirty,
  loadForm,
  loadVersionSchemaThunk,
  createNewVersionThunk,
  saveFormThunk,
} from '@/lib/slices/formSlice';
import type { FormState } from '@/lib/slices/formSlice';
import type { SobaFormVersionType } from '@/src/types/forms';

const baseState: FormState = {
  formId: null,
  formName: '',
  formWorkspaceId: '',
  formDesc: '',
  formSchema: null,
  currentVersion: null,
  versions: [],
  selectedVersionId: null,
  isHistoryView: false,
  historicalVersionNo: null,
  loading: false,
  isSaving: false,
  isDirty: false,
  error: null,
  isSessionExpiredError: false,
  submissions: [],
};

const mockVersion: SobaFormVersionType = {
  id: 'v1-id',
  versionNo: 1,
  state: 'draft',
  engineSyncStatus: 'synced',
  currentRevisionNo: 1,
  createdAt: '2026-08-26',
  updatedAt: '2026-08-26',
};

describe('formSlice', () => {
  it('clearFormState resets state', () => {
    const next = formReducer(
      { ...baseState, formName: 'My Form', isDirty: true },
      clearFormState(),
    );
    expect(next).toEqual(baseState);
  });

  it('setFormName sets state and marks dirty', () => {
    const next = formReducer(baseState, setFormName('New Name'));
    expect(next.formName).toBe('New Name');
    expect(next.isDirty).toBe(true);
  });

  it('setFormDesc sets state and marks dirty', () => {
    const next = formReducer(baseState, setFormDesc('New Desc'));
    expect(next.formDesc).toBe('New Desc');
    expect(next.isDirty).toBe(true);
  });

  it('setFormWorkspaceId sets state and marks dirty', () => {
    const next = formReducer(baseState, setFormWorkspaceId('ws-1'));
    expect(next.formWorkspaceId).toBe('ws-1');
    expect(next.isDirty).toBe(true);
  });

  it('setFormSchema sets state and marks dirty', () => {
    const schema = { display: 'form', components: [] } as FormType;
    const next = formReducer(baseState, setFormSchema(schema));
    expect(next.formSchema).toEqual(schema);
    expect(next.isDirty).toBe(true);
  });

  it('setFormDirty sets dirty flag', () => {
    const next = formReducer(baseState, setFormDirty(true));
    expect(next.isDirty).toBe(true);
  });

  // loadForm
  it('handles loadForm.pending', () => {
    const next = formReducer(baseState, {
      type: loadForm.pending.type,
      meta: { arg: { formId: 'f1' } },
    });
    expect(next.loading).toBe(true);
    expect(next.error).toBeNull();
    expect(next.formId).toBe('f1');
  });

  it('handles loadForm.fulfilled', () => {
    const payload = {
      form: { name: 'Form 1', workspaceId: 'ws1', description: 'Desc 1' },
      versions: [mockVersion],
      currentVersion: mockVersion,
      schema: { components: [] },
    };
    const next = formReducer(baseState, {
      type: loadForm.fulfilled.type,
      payload,
      meta: { arg: { formId: 'f1' } },
    });
    expect(next.loading).toBe(false);
    expect(next.formId).toBe('f1');
    expect(next.formName).toBe('Form 1');
    expect(next.formWorkspaceId).toBe('ws1');
    expect(next.formDesc).toBe('Desc 1');
    expect(next.versions).toHaveLength(1);
    expect(next.currentVersion).toEqual(mockVersion);
    expect(next.selectedVersionId).toBe('current');
    expect(next.formSchema).toEqual({ components: [] });
    expect(next.isDirty).toBe(false);
  });

  it('handles loadForm.rejected', () => {
    const next = formReducer(baseState, {
      type: loadForm.rejected.type,
      payload: { message: 'Failed to load', isSessionExpiredError: true },
    });
    expect(next.loading).toBe(false);
    expect(next.error).toBe('Failed to load');
    expect(next.isSessionExpiredError).toBe(true);
  });

  // loadVersionSchemaThunk
  it('handles loadVersionSchemaThunk.pending', () => {
    const next = formReducer(baseState, { type: loadVersionSchemaThunk.pending.type });
    expect(next.loading).toBe(true);
  });

  it('handles loadVersionSchemaThunk.fulfilled for an older version', () => {
    const older: SobaFormVersionType = { ...mockVersion, id: 'v0-id', versionNo: 0 };
    const payload = { schema: { components: [] }, version: older };
    const next = formReducer(
      { ...baseState, currentVersion: mockVersion, selectedVersionId: 'current' },
      { type: loadVersionSchemaThunk.fulfilled.type, payload },
    );
    expect(next.loading).toBe(false);
    expect(next.formSchema).toEqual({ components: [] });
    expect(next.isHistoryView).toBe(true);
    expect(next.selectedVersionId).toBe('v0-id');
    expect(next.historicalVersionNo).toBe(0);
    expect(next.isDirty).toBe(false);
  });

  it('handles loadVersionSchemaThunk.fulfilled for the current version', () => {
    const payload = { schema: { components: [] }, version: mockVersion };
    const next = formReducer(
      {
        ...baseState,
        currentVersion: mockVersion,
        isHistoryView: true,
        selectedVersionId: 'v0-id',
        historicalVersionNo: 0,
      },
      { type: loadVersionSchemaThunk.fulfilled.type, payload },
    );
    // 'current' is the only key the version picker offers for the current draft.
    expect(next.selectedVersionId).toBe('current');
    expect(next.isHistoryView).toBe(false);
    expect(next.historicalVersionNo).toBeNull();
  });

  // createNewVersionThunk
  it('handles createNewVersionThunk.pending', () => {
    const next = formReducer(baseState, { type: createNewVersionThunk.pending.type });
    expect(next.loading).toBe(true);
    expect(next.isSaving).toBe(true);
  });

  it('handles createNewVersionThunk.fulfilled', () => {
    const payload = { newVersion: mockVersion, versions: [mockVersion] };
    const next = formReducer(
      { ...baseState, isHistoryView: true, historicalVersionNo: 5 },
      { type: createNewVersionThunk.fulfilled.type, payload },
    );
    expect(next.loading).toBe(false);
    expect(next.isSaving).toBe(false);
    expect(next.currentVersion).toEqual(mockVersion);
    expect(next.versions).toHaveLength(1);
    expect(next.selectedVersionId).toBe('current');
    expect(next.isHistoryView).toBe(false);
    expect(next.historicalVersionNo).toBeNull();
    expect(next.isDirty).toBe(false);
  });

  it('handles saveFormThunk.fulfilled with a published version', () => {
    const published: SobaFormVersionType = { ...mockVersion, state: 'published' };
    const next = formReducer(
      { ...baseState, currentVersion: mockVersion, versions: [mockVersion] },
      { type: saveFormThunk.fulfilled.type, payload: { isNew: false, publishedVersion: published } },
    );
    expect(next.currentVersion?.state).toBe('published');
    expect(next.versions[0].state).toBe('published');
    expect(next.isDirty).toBe(false);
  });

  // saveFormThunk
  it('handles saveFormThunk.pending', () => {
    const next = formReducer(baseState, { type: saveFormThunk.pending.type });
    expect(next.isSaving).toBe(true);
  });

  it('handles saveFormThunk.fulfilled (create)', () => {
    const payload = { isNew: true, createdId: 'new-id' };
    const next = formReducer(baseState, { type: saveFormThunk.fulfilled.type, payload });
    expect(next.isSaving).toBe(false);
    expect(next.isDirty).toBe(false);
    expect(next.formId).toBe('new-id');
  });

  it('handles saveFormThunk.fulfilled (update)', () => {
    const payload = { isNew: false };
    const next = formReducer(
      { ...baseState, formId: 'existing-id' },
      { type: saveFormThunk.fulfilled.type, payload },
    );
    expect(next.isSaving).toBe(false);
    expect(next.isDirty).toBe(false);
    expect(next.formId).toBe('existing-id'); // Unchanged
  });
});
