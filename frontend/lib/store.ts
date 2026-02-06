import { configureStore } from '@reduxjs/toolkit';
import { createWrapper } from 'next-redux-wrapper';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import keycloakReducer, { KeycloakState } from './slices/keycloakSlice';
import themeReducer, { ThemeState } from './slices/themeSlice';

const reducer = {
  keycloak: keycloakReducer,
  theme: themeReducer,
};

const makeStore = () =>
  configureStore({
    reducer,
    devTools: process.env.NODE_ENV !== 'production',
  });

export type AppStore = ReturnType<typeof makeStore>;
export type AppState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const wrapper = createWrapper<AppStore>(makeStore, { debug: false });

// Strongly-typed hooks for use across the app
export type RootState = {
  keycloak: KeycloakState;
  theme: ThemeState;
};
export type RootDispatch = AppDispatch;

export const useAppDispatch = () => useDispatch<RootDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default makeStore;
