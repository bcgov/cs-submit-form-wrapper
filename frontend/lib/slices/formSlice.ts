import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { FormType } from '@formio/react';
import {
  getSobaForm,
  getSobaFormVersions,
  getFormVersionSchema,
  createFormVersion,
  saveFormVersionSchema,
  publishSobaFormVersion,
  createSobaFormioForm,
  updateSobaForm,
  getSobaSubmissions,
  deleteSubmitSubmission,
} from '@/src/shared/api/sobaApi';
import type { SobaFormType, SobaFormVersionType } from '@/src/types/forms';
import type { SubmissionListItem } from '@/src/types/submissions';
import { isSessionExpired } from '@/src/shared/api/sobaFetch';

export interface FormState {
  formId: string | null;
  formName: string;
  formWorkspaceId: string;
  formDesc: string;
  formSchema: FormType | null;
  currentVersion: SobaFormVersionType | null;
  versions: SobaFormVersionType[];
  submissions: SubmissionListItem[];
  selectedVersionId: string | null;
  isHistoryView: boolean;
  historicalVersionNo: number | null;

  loading: boolean;
  isSaving: boolean;
  isDirty: boolean;
  error: string | null;
  isSessionExpiredError: boolean;
}

const initialState: FormState = {
  formId: null,
  formName: '',
  formWorkspaceId: '',
  formDesc: '',
  formSchema: null,
  currentVersion: null,
  versions: [],
  submissions: [],
  selectedVersionId: null,
  isHistoryView: false,
  historicalVersionNo: null,
  loading: false,
  isSaving: false,
  isDirty: false,
  error: null,
  isSessionExpiredError: false,
};

// Async thunks

export const loadForm = createAsyncThunk(
  'form/loadForm',
  async ({ token, formId }: { token: string; formId: string }, { rejectWithValue }) => {
    try {
      const [form, versionsData, submissionsData] = await Promise.all([
        getSobaForm(token, formId),
        getSobaFormVersions(token, formId),
        getSobaSubmissions(token, { formId }),
      ]);

      const items = versionsData.items || [];
      const current = items.reduce<SobaFormVersionType | null>(
        (acc, v) => (!acc || v.versionNo > acc.versionNo ? v : acc),
        null,
      );

      let schema = null;
      if (current?.id) {
        schema = await getFormVersionSchema(token, current.id);
      }

      return {
        form,
        versions: items,
        submissions: submissionsData.items || [],
        currentVersion: current,
        schema: schema as FormType | null,
      };
    } catch (error: unknown) {
      if (isSessionExpired(error)) {
        return rejectWithValue({ message: 'Session expired', isSessionExpiredError: true });
      }
      const message = error instanceof Error ? error.message : 'Failed to load form';
      return rejectWithValue({ message, isSessionExpiredError: false });
    }
  },
);

export const loadFormSubmissionsThunk = createAsyncThunk(
  'form/loadFormSubmissions',
  async ({ token, formId }: { token: string; formId: string }, { rejectWithValue }) => {
    try {
      const submissionsData = await getSobaSubmissions(token, { formId });
      return { submissions: submissionsData.items || [] };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load submissions';
      return rejectWithValue({ message });
    }
  },
);

export const deleteFormSubmissionThunk = createAsyncThunk(
  'form/deleteFormSubmission',
  async (
    { token, submissionId }: { token: string | undefined; submissionId: string },
    { rejectWithValue },
  ) => {
    try {
      await deleteSubmitSubmission(token, submissionId);
      return { submissionId };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete submission';
      return rejectWithValue({ message });
    }
  },
);

export const loadVersionSchemaThunk = createAsyncThunk(
  'form/loadVersionSchema',
  async (
    { token, version }: { token: string; version: SobaFormVersionType },
    { rejectWithValue },
  ) => {
    try {
      const schema = await getFormVersionSchema(token, version.id);
      return { schema: schema as FormType | null, version };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load version schema';
      return rejectWithValue({ message });
    }
  },
);

export const createNewVersionThunk = createAsyncThunk(
  'form/createNewVersion',
  async (
    { token, formId, formSchema }: { token: string; formId: string; formSchema: FormType },
    { rejectWithValue },
  ) => {
    try {
      const newVersion = await createFormVersion(token, formId);
      await saveFormVersionSchema(token, newVersion.id, formSchema);
      const versionsData = await getSobaFormVersions(token, formId);
      return { newVersion, versions: versionsData.items || [] };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create new version';
      return rejectWithValue({ message });
    }
  },
);

export const saveFormThunk = createAsyncThunk(
  'form/saveForm',
  async (
    {
      token,
      formId,
      formName,
      formDesc,
      selectedWorkspaceId,
      formSchema,
      publish,
      currentVersionId,
    }: {
      token: string;
      formId: string | null;
      formName: string;
      formDesc: string;
      selectedWorkspaceId: string | null;
      formSchema: FormType;
      publish: boolean;
      currentVersionId?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      if (formId && currentVersionId) {
        await updateSobaForm(token, formId, { name: formName, description: formDesc });
        await saveFormVersionSchema(token, currentVersionId, formSchema);
        if (publish) {
          await publishSobaFormVersion(token, currentVersionId);
        }
        return { isNew: false };
      } else {
        const data: SobaFormType = { name: formName, description: formDesc };
        const created = await createSobaFormioForm(token, data, selectedWorkspaceId || undefined);
        const versionId = created.formVersion?.id;
        if (versionId) {
          await saveFormVersionSchema(token, versionId, formSchema);
          if (publish) {
            await publishSobaFormVersion(token, versionId);
          }
        }
        return { isNew: true, createdId: created.id };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save form';
      return rejectWithValue({ message });
    }
  },
);

const formSlice = createSlice({
  name: 'form',
  initialState,
  reducers: {
    clearFormState: (state) => {
      Object.assign(state, initialState);
    },
    setFormName: (state, action: PayloadAction<string>) => {
      state.formName = action.payload;
      state.isDirty = true;
    },
    setFormDesc: (state, action: PayloadAction<string>) => {
      state.formDesc = action.payload;
      state.isDirty = true;
    },
    setFormWorkspaceId: (state, action: PayloadAction<string>) => {
      state.formWorkspaceId = action.payload;
      state.isDirty = true;
    },
    setFormSchema: (state, action: PayloadAction<FormType | null>) => {
      state.formSchema = action.payload;
      state.isDirty = true;
    },
    setFormDirty: (state, action: PayloadAction<boolean>) => {
      state.isDirty = action.payload;
    },
    setSelectedVersionId: (state, action: PayloadAction<string | null>) => {
      state.selectedVersionId = action.payload;
      if (action.payload === 'current' || action.payload === null) {
        state.isHistoryView = false;
        state.historicalVersionNo = null;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // loadForm
      .addCase(loadForm.pending, (state, action) => {
        state.loading = true;
        state.error = null;
        state.isSessionExpiredError = false;
        state.formId = action.meta.arg.formId;
      })
      .addCase(loadForm.fulfilled, (state, action) => {
        state.loading = false;
        const { form, versions, submissions, currentVersion, schema } = action.payload;
        state.formName = form?.name ?? '';
        state.formWorkspaceId = form?.workspaceId ?? '';
        state.formDesc = form?.description ?? '';
        state.versions = versions;
        state.submissions = submissions;
        state.currentVersion = currentVersion;
        state.selectedVersionId = 'current';
        state.isHistoryView = false;
        state.formSchema = schema;
        state.isDirty = false;
      })
      .addCase(loadForm.rejected, (state, action) => {
        state.loading = false;
        const payload = action.payload as { message: string; isSessionExpiredError: boolean };
        state.error = payload?.message || 'Failed to load form';
        state.isSessionExpiredError = payload?.isSessionExpiredError || false;
      })

      // loadFormSubmissionsThunk
      .addCase(loadFormSubmissionsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadFormSubmissionsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.submissions = action.payload.submissions;
      })
      .addCase(loadFormSubmissionsThunk.rejected, (state, action) => {
        state.loading = false;
        const payload = action.payload as { message: string };
        state.error = payload?.message || 'Failed to load submissions';
      })

      //deleteFormSubmissionThunk
      .addCase(deleteFormSubmissionThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteFormSubmissionThunk.fulfilled, (state, action) => {
        state.loading = false;
        const { submissionId } = action.payload;
        state.submissions = state.submissions.filter((sub) => sub.id !== submissionId);
      })
      .addCase(deleteFormSubmissionThunk.rejected, (state, action) => {
        state.loading = false;
        const payload = action.payload as { message: string };
        state.error = payload?.message || 'Failed to delete submission';
      })

      // loadVersionSchemaThunk
      .addCase(loadVersionSchemaThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadVersionSchemaThunk.fulfilled, (state, action) => {
        state.loading = false;
        const { schema, version } = action.payload;
        state.formSchema = schema;
        state.isHistoryView = true;
        state.selectedVersionId = version.id;
        state.historicalVersionNo = version.versionNo;
        state.isDirty = false;
      })
      .addCase(loadVersionSchemaThunk.rejected, (state, action) => {
        state.loading = false;
        const payload = action.payload as { message: string };
        state.error = payload?.message || 'Failed to load version schema';
      })

      // createNewVersionThunk
      .addCase(createNewVersionThunk.pending, (state) => {
        state.loading = true;
        state.isSaving = true;
        state.error = null;
      })
      .addCase(createNewVersionThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.isSaving = false;
        const { newVersion, versions } = action.payload;
        state.versions = versions;
        state.currentVersion = newVersion;
        state.selectedVersionId = 'current';
        state.isHistoryView = false;
        state.isDirty = false;
      })
      .addCase(createNewVersionThunk.rejected, (state, action) => {
        state.loading = false;
        state.isSaving = false;
        const payload = action.payload as { message: string };
        state.error = payload?.message || 'Failed to create new version';
      })

      // saveFormThunk
      .addCase(saveFormThunk.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(saveFormThunk.fulfilled, (state, action) => {
        state.isSaving = false;
        state.isDirty = false;
        if (action.payload.isNew && action.payload.createdId) {
          state.formId = action.payload.createdId;
        }
      })
      .addCase(saveFormThunk.rejected, (state, action) => {
        state.isSaving = false;
        const payload = action.payload as { message: string };
        state.error = payload?.message || 'Failed to save form';
      });
  },
});

export const {
  clearFormState,
  setFormName,
  setFormDesc,
  setFormWorkspaceId,
  setFormSchema,
  setFormDirty,
  setSelectedVersionId,
} = formSlice.actions;

export default formSlice.reducer;
