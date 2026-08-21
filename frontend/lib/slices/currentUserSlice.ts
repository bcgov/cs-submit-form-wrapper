import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { fetchCurrentUser, type CurrentUserResponse } from '@/src/shared/api/sobaApi';

export type CurrentUserState = {
  data: CurrentUserResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error?: string;
  lastToken?: string;
};

const initialState: CurrentUserState = {
  data: null,
  status: 'idle',
  error: undefined,
  lastToken: undefined,
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
      state.error = undefined;
      state.lastToken = undefined;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadCurrentUser.pending, (state, action) => {
        state.status = 'loading';
        state.error = undefined;
        state.lastToken = action.meta.arg;
      })
      .addCase(loadCurrentUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
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
