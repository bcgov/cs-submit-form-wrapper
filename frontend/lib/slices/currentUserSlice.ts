import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { fetchCurrentUser, type CurrentUserResponse } from '@/src/shared/api/sobaApi';

export type CurrentUserState = {
  data: CurrentUserResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  /** Survives a later failure, unlike `data`, so a background reload is distinguishable. */
  loadedOnce: boolean;
  error?: string;
};

const initialState: CurrentUserState = {
  data: null,
  status: 'idle',
  loadedOnce: false,
  error: undefined,
};

export const loadCurrentUser = createAsyncThunk<
  CurrentUserResponse,
  string,
  { rejectValue: string }
>('currentUser/load', async (token, { rejectWithValue }) => {
  try {
    return await fetchCurrentUser(token);
  } catch (err: unknown) {
    return rejectWithValue((err as { message?: string })?.message ?? 'Failed to load current user');
  }
});

const currentUserSlice = createSlice({
  name: 'currentUser',
  initialState,
  reducers: {
    clearCurrentUser(state) {
      state.data = null;
      state.status = 'idle';
      state.loadedOnce = false;
      state.error = undefined;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadCurrentUser.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(loadCurrentUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.loadedOnce = true;
        state.data = action.payload;
        state.error = undefined;
      })
      .addCase(loadCurrentUser.rejected, (state, action) => {
        state.status = 'failed';
        state.data = null;
        state.error = action.payload ?? action.error.message;
      });
  },
});

export const { clearCurrentUser } = currentUserSlice.actions;
export default currentUserSlice.reducer;
