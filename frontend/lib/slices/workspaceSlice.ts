import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { fetchWorkspaces, WorkspaceItem } from '@/src/shared/api/sobaApi';

export interface WorkspaceState {
  workspaces: WorkspaceItem[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  canceledDefaultModal: boolean;
}

const initialState: WorkspaceState = {
  workspaces: [],
  status: 'idle',
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

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    clearWorkspaceState(state) {
      state.workspaces = [];
      state.status = 'idle';
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
        state.workspaces = action.payload;
      })
      .addCase(loadWorkspaces.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

export const { clearWorkspaceState, setCanceledDefaultModal } =
  workspaceSlice.actions;

export default workspaceSlice.reducer;
