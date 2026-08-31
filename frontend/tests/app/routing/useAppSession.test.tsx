import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { SWRConfig, useSWRConfig } from 'swr';

const fetchWorkspaces = vi.fn();
const fetchCurrentUser = vi.fn();
vi.mock('@/src/shared/api/sobaApi', () => ({
  fetchWorkspaces: (...args: unknown[]) => fetchWorkspaces(...args),
  fetchCurrentUser: (...args: unknown[]) => fetchCurrentUser(...args),
}));

import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import { useAppSession } from '@/src/app/routing/useAppSession';

let store: ReturnType<typeof makeStore>;

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <SWRConfig
        value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
      >
        {children}
      </SWRConfig>
    </Provider>
  );
}

const WORKSPACES = [{ id: 'ws1', kind: 'personal', role: 'owner' }];
const USER = {
  actor: { id: 'user-1', displayLabel: 'User', status: 'active' },
  profile: { displayName: 'User', email: null, preferredUsername: null },
  preferences: { defaultWorkspaceId: null },
  capabilities: { canCreateWorkspace: true },
};

function respond({ writableFails = false } = {}) {
  fetchWorkspaces.mockImplementation((_token: string, options: { requiredPermission?: string } = {}) => {
    if (options.requiredPermission && writableFails) return Promise.reject(new Error('boom'));
    return Promise.resolve({ items: WORKSPACES });
  });
  fetchCurrentUser.mockResolvedValue(USER);
}

describe('useAppSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
    respond();
  });

  it('is ready only once every bootstrap read has answered', async () => {
    const { result } = renderHook(() => useAppSession(), { wrapper });
    expect(result.current.sessionReady).toBe(false);
    await waitFor(() => expect(result.current.sessionReady).toBe(true));
    expect(result.current.sessionLoadedOnce).toBe(true);
    expect(result.current.hasWorkspaces).toBe(true);
    expect(result.current.canCreateWorkspace).toBe(true);
  });

  // Every read that can fail the session has to gate readiness too, or its failure is swallowed
  // and the app renders degraded with no retry.
  it('fails the session when only the writable-workspaces read fails', async () => {
    respond({ writableFails: true });
    const { result } = renderHook(() => useAppSession(), { wrapper });
    await waitFor(() => expect(result.current.sessionFailed).toBe(true));
    expect(result.current.sessionReady).toBe(false);
    expect(result.current.sessionLoadedOnce).toBe(false);
  });

  // The latch is what stops the guard unmounting a route mid-form-fill on a background failure.
  it('keeps sessionLoadedOnce true when a later read fails', async () => {
    const { result } = renderHook(
      () => ({ session: useAppSession(), mutate: useSWRConfig().mutate }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.session.sessionLoadedOnce).toBe(true));

    fetchWorkspaces.mockRejectedValue(new Error('boom'));
    await act(async () => {
      await result.current.mutate(['workspaces']).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.session.sessionFailed).toBe(true));
    expect(result.current.session.sessionLoadedOnce).toBe(true);
    expect(result.current.session.sessionReady).toBe(false);
  });

  // Every read that gates the session has to be waited for, or the app renders before one of them
  // has answered.
  it('is not ready while only the writable-workspaces read is pending', async () => {
    fetchWorkspaces.mockImplementation((_token: string, options: { requiredPermission?: string } = {}) =>
      options.requiredPermission ? new Promise(() => {}) : Promise.resolve({ items: WORKSPACES }),
    );
    const { result } = renderHook(() => useAppSession(), { wrapper });

    await waitFor(() => expect(result.current.hasWorkspaces).toBe(true));
    expect(result.current.sessionReady).toBe(false);
    expect(result.current.sessionLoadedOnce).toBe(false);
  });

  it('reports no onboarding need when the user has workspaces', async () => {
    const { result } = renderHook(() => useAppSession(), { wrapper });
    await waitFor(() => expect(result.current.sessionReady).toBe(true));
    expect(result.current.needsOnboarding).toBe(false);
  });

  it('needs onboarding with no workspaces and no way to create one', async () => {
    fetchWorkspaces.mockResolvedValue({ items: [] });
    fetchCurrentUser.mockResolvedValue({ ...USER, capabilities: { canCreateWorkspace: false } });
    const { result } = renderHook(() => useAppSession(), { wrapper });
    await waitFor(() => expect(result.current.needsOnboarding).toBe(true));
  });
});
