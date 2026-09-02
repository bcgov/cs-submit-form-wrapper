import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import keycloakReducer from './slices/keycloakSlice';
import notificationReducer from './slices/notificationSlice';

const reducer = {
  keycloak: keycloakReducer,
  notification: notificationReducer,
};

const makeStore = () =>
  configureStore({
    reducer,
    devTools: process.env.NODE_ENV !== 'production',
  });

// Derived from the store rather than hand-listed, so adding a slice cannot leave the type behind.
export type RootState = ReturnType<ReturnType<typeof makeStore>['getState']>;
export type AppDispatch = ReturnType<typeof makeStore>['dispatch'];

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default makeStore;
