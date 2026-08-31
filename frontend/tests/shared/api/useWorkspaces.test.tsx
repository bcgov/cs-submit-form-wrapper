import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';

const fetchWorkspaces = vi.fn();
vi.mock('@/src/shared/api/sobaApi', () => ({
  fetchWorkspaces: (...args: unknown[]) => fetchWorkspaces(...args),
}));

import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import {
  useWorkspaces,
  useWritableWorkspaces,
  useWorkspaceList,
  useRefreshWorkspaces,
} from '@/src/shared/api/useWorkspaces';

type FetchOptions = { requiredPermission?: string; offset?: number; limit?: number; q?: string };

const writableCalls = () =>
  fetchWorkspaces.mock.calls.filter(
    (call) => (call[1] as FetchOptions)?.requiredPermission === 'design_create',
  );

let store: ReturnType<typeof makeStore>;

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <SWRConfig
        value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
      >{children}</SWRConfig>
    </Provider>
  );
}

describe('useWorkspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
    fetchWorkspaces.mockImplementation((_token: string, options: FetchOptions = {}) =>
      Promise.resolve({
        items: options.requiredPermission ? [{ id: 'ws2' }] : [{ id: 'ws1' }],
        page: { offset: 0, limit: 100, total: 1 },
      }),
    );
  });

  it('reads the full list and the writable list under separate keys', async () => {
    const { result } = renderHook(
      () => ({ all: useWorkspaces(), writable: useWritableWorkspaces() }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.all.workspaces).toEqual([{ id: 'ws1' }]);
      expect(result.current.writable.workspaces).toEqual([{ id: 'ws2' }]);
    });
    expect(writableCalls()).toHaveLength(1);
  });

  // A picker showing page one of the user's workspaces would silently hide the rest.
  it('asks for every workspace the endpoint will return in one page', async () => {
    renderHook(() => useWorkspaces(), { wrapper });
    await waitFor(() => expect(fetchWorkspaces).toHaveBeenCalled());
    expect(fetchWorkspaces.mock.calls[0][1]).toMatchObject({ offset: 0, limit: 100 });
  });

  it('reads a single page for the list screen, and reports the total', async () => {
    fetchWorkspaces.mockResolvedValue({
      items: [{ id: 'ws1' }],
      page: { offset: 10, limit: 5, total: 42 },
    });
    const { result } = renderHook(
      () => useWorkspaceList({ offset: 10, limit: 5, sort: 'name:asc', q: 'pay' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.total).toBe(42));
    expect(fetchWorkspaces).toHaveBeenCalledWith('token', {
      offset: 10,
      limit: 5,
      sort: 'name:asc',
      q: 'pay',
    });
  });

  // The writable list carries the disclaimer flag that gates form creation. Refreshing only the
  // full list leaves the designer offering a workspace whose disclaimer was just revoked.
  it('refreshes the pickers and the page the list screen is showing', async () => {
    const { result } = renderHook(
      () => ({
        all: useWorkspaces(),
        writable: useWritableWorkspaces(),
        list: useWorkspaceList({ offset: 0, limit: 10, sort: 'name:asc' }),
        refresh: useRefreshWorkspaces(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(fetchWorkspaces).toHaveBeenCalledTimes(3));

    await result.current.refresh();
    await waitFor(() => expect(fetchWorkspaces).toHaveBeenCalledTimes(6));
    expect(writableCalls()).toHaveLength(2);
  });

  // A malformed 200 must not put a non-array where the route policy reads `.length`.
  it('falls back to an empty list when items is not an array', async () => {
    fetchWorkspaces.mockResolvedValue({ items: null });
    const { result } = renderHook(() => useWorkspaces(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.workspaces).toEqual([]);
  });
});
