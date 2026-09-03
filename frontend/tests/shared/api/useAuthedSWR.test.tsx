import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { SWRConfig } from 'swr';
import makeStore from '@/lib/store';
import { setAuthenticated, setToken } from '@/lib/slices/keycloakSlice';
import { useAuthedSWR, useMaybeAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import { swrConfig } from '@/src/shared/api/swrConfig';
import { SessionExpiredError } from '@/src/shared/api/sobaFetch';

// Keycloak itself never initializes here; the slice is driven directly so the hook runs against the
// real store it reads in production.
let store: ReturnType<typeof makeStore>;

function signIn(token?: string) {
  store.dispatch(setToken(token));
  store.dispatch(setAuthenticated(true));
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          shouldRetryOnError: false,
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
        }}
      >
        {children}
      </SWRConfig>
    </Provider>
  );
}

describe('useAuthedSWR', () => {
  beforeEach(() => {
    store = makeStore();
  });

  it('does not fetch when signed out', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');
    renderHook(() => useAuthedSWR(['forms'], fetcher), { wrapper });
    await waitFor(() => expect(fetcher).not.toHaveBeenCalled());
  });

  // Authenticated with no token yet is its own state: sobaFetch would send the call unauthenticated
  // rather than wait for one.
  it('does not fetch while the token is missing', async () => {
    signIn(undefined);
    const fetcher = vi.fn().mockResolvedValue('data');
    renderHook(() => useAuthedSWR(['forms'], fetcher), { wrapper });
    await waitFor(() => expect(fetcher).not.toHaveBeenCalled());
  });

  it('does not fetch when the caller reports the key is not ready', async () => {
    signIn('token-1');
    const fetcher = vi.fn().mockResolvedValue('data');
    renderHook(() => useAuthedSWR(null, fetcher), { wrapper });
    await waitFor(() => expect(fetcher).not.toHaveBeenCalled());
  });

  it('fetches with the current token and returns the data', async () => {
    signIn('token-1');
    const fetcher = vi.fn().mockResolvedValue(['a']);
    const { result } = renderHook(() => useAuthedSWR(['forms'], fetcher), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(['a']));
    expect(fetcher).toHaveBeenCalledWith('token-1');
  });

  it('keeps the same key across a token rotation and sends the new token on the next read', async () => {
    signIn('token-1');
    const fetcher = vi.fn().mockResolvedValue(['a']);
    const { result, rerender } = renderHook(() => useAuthedSWR(['forms'], fetcher), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(['a']));
    expect(fetcher).toHaveBeenCalledTimes(1);

    store.dispatch(setToken('token-2'));
    rerender();
    // A rotation alone must not refetch; the key did not change.
    expect(fetcher).toHaveBeenCalledTimes(1);

    await result.current.mutate();
    expect(fetcher).toHaveBeenLastCalledWith('token-2');
  });
});

describe('swrConfig', () => {
  it('retries a transport error but not an ended session', () => {
    const shouldRetry = swrConfig.shouldRetryOnError as (err: unknown) => boolean;
    expect(shouldRetry(new Error('Request failed (500)'))).toBe(true);
    expect(shouldRetry(new SessionExpiredError())).toBe(false);
  });
});

describe('useMaybeAuthedSWR', () => {
  beforeEach(() => {
    store = makeStore();
  });

  // The submit surface serves people who are not signed in, so this one reads without a session.
  it('reads with no token at all', async () => {
    const fetcher = vi.fn().mockResolvedValue('public');
    const { result } = renderHook(() => useMaybeAuthedSWR(['fill', 'abc'], fetcher), { wrapper });

    await waitFor(() => expect(result.current.data).toBe('public'));
    expect(fetcher).toHaveBeenCalledWith(undefined);
  });

  it('passes the token once there is one', async () => {
    signIn('token-1');
    const fetcher = vi.fn().mockResolvedValue('mine');
    const { result } = renderHook(() => useMaybeAuthedSWR(['fill', 'abc'], fetcher), { wrapper });

    await waitFor(() => expect(result.current.data).toBe('mine'));
    expect(fetcher).toHaveBeenCalledWith('token-1');
  });

  // Without the identity in its key, signing in would be served the anonymous reader's copy of a
  // submission, which carries less than the owner's.
  it('keeps the anonymous and signed-in reads apart', async () => {
    const cache = new Map();
    const shared = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>
        <SWRConfig
          value={{ provider: () => cache, dedupingInterval: 0, shouldRetryOnError: false }}
        >
          {children}
        </SWRConfig>
      </Provider>
    );
    const fetcher = vi.fn((token?: string) => Promise.resolve(token ? 'mine' : 'public'));
    const key = () => ['fill', 'abc', store.getState().keycloak.token ? 'user' : 'anonymous'];

    const anon = renderHook(() => useMaybeAuthedSWR(key(), fetcher), { wrapper: shared });
    await waitFor(() => expect(anon.result.current.data).toBe('public'));
    anon.unmount();

    signIn('token-1');
    const authed = renderHook(() => useMaybeAuthedSWR(key(), fetcher), { wrapper: shared });
    await waitFor(() => expect(authed.result.current.data).toBe('mine'));
  });
});
