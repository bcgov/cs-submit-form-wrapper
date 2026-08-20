import Keycloak from 'keycloak-js';
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { AppDispatch } from '../store';
import { clearWorkspaceState } from './workspaceSlice';
import { loadFrontendRuntimeConfig } from '@/src/shared/config/runtimeConfig';
import { disableFormioBrowserAuth } from '@/src/features/formio-v5/disableFormioBrowserAuth';
import type { RefreshOutcome } from '@/src/shared/auth/tokenRefresh';

// Keep the Keycloak instance out of Redux state (non-serializable).
// Store it in a module-level variable instead.
let kcInstance: Keycloak.KeycloakInstance | null = null;
// Distinguishes "the session ended" from "not booted yet": both leave kcInstance null, but only the
// first means a caller's token is dead and must not be sent.
let sessionEnded = false;

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
    if (kcInstance) {
      // If we already have an instance (e.g. after a layout remount from a language change),
      // just restore the state from it without re-initializing.
      return {
        token: kcInstance.token ?? undefined,
        idTokenParsed: kcInstance.idTokenParsed as Keycloak.KeycloakTokenParsed | undefined,
        authenticated: !!kcInstance.authenticated,
      };
    }

    disableFormioBrowserAuth();
    const runtimeConfig = await loadFrontendRuntimeConfig();
    const kc = new Keycloak({
      url: runtimeConfig.auth.keycloak.url,
      realm: runtimeConfig.auth.keycloak.realm,
      clientId: runtimeConfig.auth.keycloak.clientId,
    });

    try {
      await kc.init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri:
          typeof window !== 'undefined'
            ? window.location.origin + '/silent-check-sso.html'
            : undefined,
        checkLoginIframe: false,
      });

      // store instance in module-level variable (not in Redux state)
      kcInstance = kc;
      sessionEnded = false;

      if (kc.idTokenParsed) {
        await kc.updateToken(30);
      }

      return {
        token: kc.token ?? undefined,
        idTokenParsed: kc.idTokenParsed as Keycloak.KeycloakTokenParsed | undefined,
        authenticated: !!kc.authenticated,
      };
    } catch (err: unknown) {
      return rejectWithValue((err as { message?: string })?.message || String(err));
    }
  },
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
      sessionEnded = true;
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
        state.idTokenParsed = action.payload.idTokenParsed as
          | Keycloak.KeycloakTokenParsed
          | undefined;
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
export const login = () => async (dispatch: AppDispatch) => {
  let kc: Keycloak.KeycloakInstance | null = kcInstance;
  try {
    if (!kc) {
      const runtimeConfig = await loadFrontendRuntimeConfig();
      kc = new Keycloak({
        url: runtimeConfig.auth.keycloak.url,
        realm: runtimeConfig.auth.keycloak.realm,
        clientId: runtimeConfig.auth.keycloak.clientId,
      });
      kcInstance = kc;
      sessionEnded = false;
    }
    // prefer a forced login flow
    await kc.init({ onLoad: 'login-required', checkLoginIframe: false, pkceMethod: 'S256' });
    dispatch(setToken(kc.token ?? undefined));
    dispatch(setIdTokenParsed(kc.idTokenParsed as Keycloak.KeycloakTokenParsed | undefined));
    dispatch(setAuthenticated(!!kc.authenticated));
  } catch {
    // fallback to direct login redirect
    try {
      const opts = {
        redirectUri: typeof window !== 'undefined' ? window.location.origin : undefined,
      };
      kc?.login(opts);
    } catch {
      // no-op
    }
  }
};

export const logout = () => (dispatch: AppDispatch) => {
  const kc: Keycloak.KeycloakInstance | null = kcInstance;
  if (kc) {
    kc.logout();
  }
  kcInstance = null;
  disableFormioBrowserAuth();
  dispatch(clearWorkspaceState());
  dispatch(clear());
};

// keycloak-js: -1 forces a refresh, a positive value only refreshes within that many seconds of expiry.
const FORCE_REFRESH = -1;
const REFRESH_WITHIN_SECONDS = 30;

const UNAVAILABLE: RefreshOutcome = { status: 'unavailable' };
const NO_SESSION: RefreshOutcome = { status: 'no-session' };
const held = (kc: Keycloak.KeycloakInstance): RefreshOutcome =>
  kc.token ? { status: 'token', token: kc.token } : UNAVAILABLE;

/** Refresh if needed and mirror into the store. `force` is the 401 path. */
export const refreshAccessToken =
  (force: boolean) =>
  async (dispatch: AppDispatch): Promise<RefreshOutcome> => {
    const kc: Keycloak.KeycloakInstance | null = kcInstance;
    if (!kc) return sessionEnded ? NO_SESSION : UNAVAILABLE;
    // An anonymous check-sso instance has no refresh token and updateToken would throw. Nothing to
    // refresh and nothing to clear — a public visitor's upload must not tear down the instance.
    if (!kc.refreshToken) return held(kc);
    try {
      const refreshed = await kc.updateToken(force ? FORCE_REFRESH : REFRESH_WITHIN_SECONDS);
      // A logout or a failed refresh may have replaced the instance while we awaited; mirroring a
      // token from the old one would leave the store authenticated with no instance behind it.
      if (kcInstance !== kc) return UNAVAILABLE;
      // idTokenParsed is a new object every call, so dispatch only on a real refresh.
      if (refreshed) {
        dispatch(setToken(kc.token ?? undefined));
        dispatch(setIdTokenParsed(kc.idTokenParsed as Keycloak.KeycloakTokenParsed | undefined));
        dispatch(setAuthenticated(!!kc.authenticated));
      }
      return kc.token ? { status: 'token', token: kc.token } : NO_SESSION;
    } catch {
      if (kcInstance !== kc) return UNAVAILABLE;
      // keycloak-js drops its own token only when the refresh token is rejected, so that is the
      // verdict to read. Anything else is a blip: the instance keeps its token and so do we.
      if (!kc.token || !kc.authenticated) {
        dispatch(clear());
        return NO_SESSION;
      }
      return { status: 'token', token: kc.token };
    }
  };

/**
 * Refresh entry point for the UI (the header's poll, the session-error retry). Delegates so there
 * is one refresh policy: this used to clear auth on any failure, logging people out on a blip.
 */
export const refreshToken = () => async (dispatch: AppDispatch) => {
  await dispatch(refreshAccessToken(false));
};

// Accessor to the module-level Keycloak instance (not stored in Redux state)
export const getKeycloakInstance = () => kcInstance;

export default slice.reducer;
