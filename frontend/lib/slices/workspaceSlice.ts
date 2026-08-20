import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { fetchWorkspaces, selectWorkspace, WorkspaceItem } from '@/src/shared/api/sobaApi';
import { getWorkspaceId, clearWorkspaceId } from '@/src/shared/workspace/workspaceStore';

export interface WorkspaceState {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  /** Stays true across a refetch, so a background reload is distinguishable from first load. */
  loadedOnce: boolean;
  error: string | null;
  canceledDefaultModal: boolean;
}

const initialState: WorkspaceState = {
  workspaces: [],
  // Hydrate the per-tab selection from sessionStorage (null during SSR).
  activeWorkspaceId: getWorkspaceId(),
  status: 'idle',
  loadedOnce: false,
  error: null,
  canceledDefaultModal: false,
};

/** When this tab has no active workspace yet, pick one to establish via the backend. */
export function pickWorkspaceToEstablish(
  workspaces: WorkspaceItem[],
  defaultWorkspaceId?: string | null,
): WorkspaceItem | null {
  if (workspaces.length === 0) return null;
  if (defaultWorkspaceId) {
    const preferred = workspaces.find((w) => w.id === defaultWorkspaceId);
    if (preferred) return preferred;
  }
  if (workspaces.length === 1) return workspaces[0];
  return workspaces.find((w) => w.kind === 'personal') ?? null;
}

export const loadWorkspaces = createAsyncThunk(
  'workspace/loadWorkspaces',
  async (token: string, { rejectWithValue }) => {
    try {
      const response = await fetchWorkspaces(token);
      return response.items;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load workspaces';
      return rejectWithValue(message);
    }
  },
);

/** Verify membership via GET /workspaces/:id and persist the tab's active workspace. */
export const selectActiveWorkspace = createAsyncThunk(
  'workspace/selectActiveWorkspace',
  async ({ token, workspaceId }: { token: string; workspaceId: string }, { rejectWithValue }) => {
    try {
      const workspace = await selectWorkspace(token, workspaceId);
      return workspace.id;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to select workspace';
      return rejectWithValue(message);
    }
  },
);

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    // Mirror of the per-tab store. Dispatched by sobaFetch when the backend echoes the
    // resolved workspace; the source of truth for the value is the backend response.
    setActiveWorkspaceId(state, action: PayloadAction<string>) {
      state.activeWorkspaceId = action.payload;
    },
    clearWorkspaceState(state) {
      clearWorkspaceId();
      state.workspaces = [];
      state.activeWorkspaceId = null;
      state.status = 'idle';
      state.loadedOnce = false;
      state.error = null;
    },
    setCanceledDefaultModal(state, action: PayloadAction<boolean>) {
      state.canceledDefaultModal = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadWorkspaces.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(loadWorkspaces.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.loadedOnce = true;
        state.workspaces = action.payload;
        // No auto-pick: the active workspace is established only by a backend response
        // (explicit selection via GET /workspaces/:id, or resource-derived deep links).
        // If the stored selection is no longer a workspace the user belongs to, drop it.
        if (
          state.activeWorkspaceId &&
          !state.workspaces.some((w) => w.id === state.activeWorkspaceId)
        ) {
          clearWorkspaceId();
          state.activeWorkspaceId = null;
        }
      })
      .addCase(loadWorkspaces.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(selectActiveWorkspace.fulfilled, (state, action) => {
        state.activeWorkspaceId = action.payload;
      });
  },
});

export const { setActiveWorkspaceId, clearWorkspaceState, setCanceledDefaultModal } = workspaceSlice.actions;

export default workspaceSlice.reducer;
