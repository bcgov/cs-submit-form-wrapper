import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { fetchWorkspaces, WorkspaceItem } from '@/src/shared/api/sobaApi';

export interface WorkspaceState {
  workspaces: WorkspaceItem[];
  writableWorkspaces: WorkspaceItem[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  writableStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  /** Stays true across a refetch, so a background reload is distinguishable from first load. */
  loadedOnce: boolean;
  /** Same, for the writable list — a failure here counts as a failed session, so it must gate too. */
  writableLoadedOnce: boolean;
  error: string | null;
  canceledDefaultModal: boolean;
}

const initialState: WorkspaceState = {
  workspaces: [],
  writableWorkspaces: [],
  status: 'idle',
  writableStatus: 'idle',
  loadedOnce: false,
  writableLoadedOnce: false,
  error: null,
  canceledDefaultModal: false,
};

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

// Future: fold this into loadWorkspaces once the API returns a per-workspace capability flag.
// Two lists over the same data drift apart unless every mutation refreshes both by hand.
export const loadWritableWorkspaces = createAsyncThunk(
  'workspace/loadWritableWorkspaces',
  async (token: string, { rejectWithValue }) => {
    try {
      const response = await fetchWorkspaces(token, 'design_create');
      return response.items;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load writable workspaces';
      return rejectWithValue(message);
    }
  },
);

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    clearWorkspaceState(state) {
      state.workspaces = [];
      state.writableWorkspaces = [];
      state.status = 'idle';
      state.writableStatus = 'idle';
      state.loadedOnce = false;
      state.writableLoadedOnce = false;
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
        // parseJson casts the body unchecked, so a malformed 200 can land a non-array here.
        state.workspaces = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(loadWorkspaces.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(loadWritableWorkspaces.pending, (state) => {
        state.writableStatus = 'loading';
      })
      .addCase(loadWritableWorkspaces.fulfilled, (state, action) => {
        state.writableStatus = 'succeeded';
        state.writableLoadedOnce = true;
        state.writableWorkspaces = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(loadWritableWorkspaces.rejected, (state, action) => {
        state.writableStatus = 'failed';
        state.error = action.payload as string;
      });
  },
});

export const { clearWorkspaceState, setCanceledDefaultModal } = workspaceSlice.actions;

export default workspaceSlice.reducer;
