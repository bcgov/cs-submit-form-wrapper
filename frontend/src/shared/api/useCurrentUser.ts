'use client';

import { useCallback, useMemo } from 'react';
import { useSWRConfig } from 'swr';
import { fetchCurrentUser } from './sobaApi';
import { useAuthedSWR } from './useAuthedSWR';
import { sessionReadConfig } from './swrConfig';
import type { CurrentUserResponse } from '@/src/types/user';

const CURRENT_USER_KEY = ['me'] as const;

export function useCurrentUser() {
  const { data, isLoading, error, mutate } = useAuthedSWR<CurrentUserResponse>(
    CURRENT_USER_KEY,
    (token) => fetchCurrentUser(token),
    sessionReadConfig,
  );

  const displayName = useMemo(
    () =>
      data?.actor?.displayLabel ??
      data?.profile?.displayName ??
      data?.profile?.preferredUsername ??
      null,
    [data],
  );

  return {
    data: data ?? null,
    displayName,
    loaded: data !== undefined,
    isLoading,
    error: error ?? null,
    hasError: !!error,
    mutate,
  };
}

export function useRefreshCurrentUser() {
  const { mutate } = useSWRConfig();
  return useCallback(() => mutate(CURRENT_USER_KEY), [mutate]);
}
