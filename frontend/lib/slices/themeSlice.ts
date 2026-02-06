import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ThemeState = {
  isDark: boolean;
};

const initialState: ThemeState = {
  // Default to the user's system preference when available (client); fall back to light on server.
  isDark: typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
};

const slice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setDark(state, action: PayloadAction<boolean>) {
      state.isDark = action.payload;
    },
    toggleDark(state) {
      state.isDark = !state.isDark;
    },
  },
});

export const { setDark, toggleDark } = slice.actions;

export default slice.reducer;
