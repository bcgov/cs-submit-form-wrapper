import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { fetchWorkspaces, WorkspaceItem } from '@/src/shared/api/sobaApi';

export interface WorkspaceState {
  workspaces: WorkspaceItem[];
  writableWorkspaces: WorkspaceItem[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  writableStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  canceledDefaultModal: boolean;
  selectedWorkspaceId: string | null;
}

const initialState: WorkspaceState = {
  workspaces: [],
  writableWorkspaces: [],
  status: 'idle',
  writableStatus: 'idle',
  error: null,
  canceledDefaultModal: false,
  selectedWorkspaceId: null,
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
      state.error = null;
      state.selectedWorkspaceId = null;
    },
    setCanceledDefaultModal(state, action: PayloadAction<boolean>) {
      state.canceledDefaultModal = action.payload;
    },
    setSelectedWorkspaceId(state, action: PayloadAction<string | null>) {
      state.selectedWorkspaceId = action.payload;
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
      })
      .addCase(loadWritableWorkspaces.pending, (state) => {
        state.writableStatus = 'loading';
      })
      .addCase(loadWritableWorkspaces.fulfilled, (state, action) => {
        state.writableStatus = 'succeeded';
        state.writableWorkspaces = action.payload;
      })
      .addCase(loadWritableWorkspaces.rejected, (state, action) => {
        state.writableStatus = 'failed';
        state.error = action.payload as string;
      });
  },
});

export const { clearWorkspaceState, setCanceledDefaultModal, setSelectedWorkspaceId } =
  workspaceSlice.actions;

export default workspaceSlice.reducer;
