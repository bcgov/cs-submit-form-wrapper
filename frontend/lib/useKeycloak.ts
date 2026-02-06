import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from './store';
import { login, logout, refreshToken, initKeycloak, getKeycloakInstance } from './slices/keycloakSlice';

export function useKeycloak() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => s.keycloak);

  const doLogin = useCallback(() => dispatch(login()), [dispatch]);
  const doLogout = useCallback(() => dispatch(logout()), [dispatch]);
  const doRefresh = useCallback(() => dispatch(refreshToken()), [dispatch]);
  const doInit = useCallback(() => dispatch(initKeycloak()), [dispatch]);

  return {
    keycloak: getKeycloakInstance(),
    token: state.token,
    idTokenParsed: state.idTokenParsed,
    authenticated: state.authenticated,
    initializing: state.initializing,
    error: state.error,
    login: doLogin,
    logout: doLogout,
    refresh: doRefresh,
    init: doInit,
  };
}
