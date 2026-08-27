'use client';

import { useStore } from 'react-redux';
import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import type { RootState } from '@/lib/store';
import { SessionExpiredError } from './sobaFetch';

/** Key parts for an authenticated read. `null` from the caller means the request is not ready. */
export type AuthedKey = readonly unknown[] | null;

/**
 * Authenticated read through SWR. The key is the caller's, gated on a usable session; the token is
 * supplied to the fetcher instead of being keyed on.
 */
export function useAuthedSWR<T>(
  key: AuthedKey,
  fetcher: (token: string) => Promise<T>,
  config?: SWRConfiguration<T>,
): SWRResponse<T> {
  const { authenticated, token } = useKeycloak();
  const store = useStore<RootState>();

  // Signed in but still waiting on a token is not ready either: sobaFetch sends a call with no
  // Authorization header rather than waiting, and the backend answers 401.
  const ready = authenticated && !!token;

  return useSWR<T>(
    ready && key ? key : null,
    () => {
      // A rotation mints a new token for the same user. Keying on it would refetch every mounted
      // screen every 30 seconds, so the live one is read here instead.
      const current = store.getState().keycloak.token;
      if (!current) throw new SessionExpiredError();
      return fetcher(current);
    },
    config,
  );
}
