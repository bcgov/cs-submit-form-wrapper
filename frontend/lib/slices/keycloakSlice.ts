import Keycloak from 'keycloak-js';
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

// Keep the Keycloak instance out of Redux state (non-serializable).
// Store it in a module-level variable instead.
let kcInstance: Keycloak.KeycloakInstance | null = null;

export type KeycloakState = {
  token?: string;
  idTokenParsed?: Keycloak.KeycloakTokenParsed;
  authenticated: boolean;
  initializing: boolean;
  error?: string;
};

const initialState: KeycloakState = {
  token: undefined,
  idTokenParsed: undefined,
  authenticated: false,
  initializing: false,
  error: undefined,
};

// initialize Keycloak silently (check-sso). Useful on page load to pick up existing session.
type InitResult = {
  token?: string;
  idTokenParsed?: Keycloak.KeycloakTokenParsed;
  authenticated: boolean;
};

export const initKeycloak = createAsyncThunk<InitResult, void, { rejectValue: string }>(
  'keycloak/init',
  async (_, { rejectWithValue }) => {
    const kc = new Keycloak({
      url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || '',
      realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || '',
      clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || '',
    });

    try {
      const inited = await kc.init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: typeof window !== 'undefined' ? window.location.origin + '/silent-check-sso.html' : undefined,
        checkLoginIframe: false,
      });

      // store instance in module-level variable (not in Redux state)
      kcInstance = kc;

      return {
        token: kc.token ?? undefined,
        idTokenParsed: kc.idTokenParsed as Keycloak.KeycloakTokenParsed | undefined,
        authenticated: !!kc.authenticated,
      };
    } catch (err: any) {
      return rejectWithValue(err?.message || String(err));
    }
  }
);

const slice = createSlice({
  name: 'keycloak',
  initialState,
  reducers: {
    // Keycloak instance is kept out of Redux state. Use module-level kcInstance.
    setToken(state, action: PayloadAction<string | undefined>) {
      state.token = action.payload;
    },
    setIdTokenParsed(state, action: PayloadAction<Keycloak.KeycloakTokenParsed | undefined>) {
      state.idTokenParsed = action.payload;
    },
    setAuthenticated(state, action: PayloadAction<boolean>) {
      state.authenticated = action.payload;
    },
    clear(state) {
      // also clear module-level instance
      kcInstance = null;
      state.token = undefined;
      state.idTokenParsed = undefined;
      state.authenticated = false;
      state.initializing = false;
      state.error = undefined;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initKeycloak.pending, (state) => {
        state.initializing = true;
        state.error = undefined;
      })
      .addCase(initKeycloak.fulfilled, (state, action) => {
        state.initializing = false;
        state.token = action.payload.token ?? undefined;
        //I don't love this but this is where formio pulls the token from
        localStorage.setItem('formioToken', action.payload.token ?? '');
        state.idTokenParsed = action.payload.idTokenParsed as Keycloak.KeycloakTokenParsed | undefined;
        state.authenticated = !!action.payload.authenticated;
      })
      .addCase(initKeycloak.rejected, (state, action) => {
        state.initializing = false;
        state.error = action.payload ?? action.error.message;
      });
  },
});

export const { setToken, setIdTokenParsed, setAuthenticated, clear } = slice.actions;

// Helper thunks
export const login = () => async (dispatch: any, getState: any) => {
  let kc: Keycloak.KeycloakInstance | null = kcInstance;
  if (!kc) {
    kc = new Keycloak({
      url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || '',
      realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || '',
      clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || '',
    });
    kcInstance = kc;
  }

  try {
    // prefer a forced login flow
    await kc.init({ onLoad: 'login-required', checkLoginIframe: false, pkceMethod: 'S256' });
    dispatch(setToken(kc.token ?? undefined));
    dispatch(setIdTokenParsed(kc.idTokenParsed as Keycloak.KeycloakTokenParsed | undefined));
    dispatch(setAuthenticated(!!kc.authenticated));
  } catch (err) {
    // fallback to direct login redirect
    try {
      kc.login();
    } catch (_e) {
      // no-op
    }
  }
};

export const logout = () => (dispatch: any, getState: any) => {
  const kc: Keycloak.KeycloakInstance | null = kcInstance;
  if (kc) {
    kc.logout();
  }
  kcInstance = null;
  dispatch(clear());
};

export const refreshToken = () => async (dispatch: any, getState: any) => {
  const kc: Keycloak.KeycloakInstance | null = kcInstance;
  if (!kc) return;
  try {
    const refreshed = await kc.updateToken(30);
    if (refreshed) {
      dispatch(setToken(kc.token ?? undefined));
      dispatch(setIdTokenParsed(kc.idTokenParsed as Keycloak.KeycloakTokenParsed | undefined));
      dispatch(setAuthenticated(!!kc.authenticated));
    }
  } catch (err) {
    // token refresh failed
    dispatch(clear());
  }
};

// Accessor to the module-level Keycloak instance (not stored in Redux state)
export const getKeycloakInstance = () => kcInstance;

export default slice.reducer;
