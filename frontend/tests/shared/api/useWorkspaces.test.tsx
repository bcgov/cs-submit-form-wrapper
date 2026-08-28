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
  useRefreshWorkspaces,
} from '@/src/shared/api/useWorkspaces';

let store: ReturnType<typeof makeStore>;

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
    </Provider>
  );
}

describe('useWorkspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = makeStore();
    store.dispatch(setToken('token'));
    store.dispatch(setAuthenticated(true));
    fetchWorkspaces.mockImplementation((_token: string, requiredPermission?: string) =>
      Promise.resolve({ items: requiredPermission ? [{ id: 'ws2' }] : [{ id: 'ws1' }] }),
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
    expect(fetchWorkspaces).toHaveBeenCalledWith('token');
    expect(fetchWorkspaces).toHaveBeenCalledWith('token', 'design_create');
  });

  // The writable list carries the disclaimer flag that gates form creation. Refreshing only the
  // full list leaves the designer offering a workspace whose disclaimer was just revoked.
  it('refreshes both lists', async () => {
    const { result } = renderHook(
      () => ({
        all: useWorkspaces(),
        writable: useWritableWorkspaces(),
        refresh: useRefreshWorkspaces(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(fetchWorkspaces).toHaveBeenCalledTimes(2));

    await result.current.refresh();
    await waitFor(() => expect(fetchWorkspaces).toHaveBeenCalledTimes(4));
    expect(fetchWorkspaces.mock.calls.filter((c) => c[1] === 'design_create')).toHaveLength(2);
  });

  // A malformed 200 must not put a non-array where the route policy reads `.length`.
  it('falls back to an empty list when items is not an array', async () => {
    fetchWorkspaces.mockResolvedValue({ items: null });
    const { result } = renderHook(() => useWorkspaces(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.workspaces).toEqual([]);
  });
});
