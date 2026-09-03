'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  fetchFeatureScope,
  fetchFeatureScopes,
  fetchSobaAdmins,
} from '@/src/shared/api/sobaApiAdmin';
import { unstable_serialize, useSWRConfig } from 'swr';
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import type { FeatureScopeItem, SobaAdminItem } from '@/src/types/admin';

const ADMIN_LIST_LIMIT = 100;
const SCOPE_LIST_LIMIT = 200;

const scopeKey = (featureScopeId: string) => ['feature-scope', featureScopeId];

/**
 * A failed reload leaves the table showing the rows it already had, where the table's own error
 * state is not reached, so these reads report the failure to the caller. Retrying would report it
 * again for the same load.
 */
const reportOnce = (onError: (cause: unknown) => void) => ({
  shouldRetryOnError: false,
  onError,
});

/** The limit the server stopped at, for the "showing the first N" notice. */
function truncatedAt(page?: { limit: number; hasMore: boolean }): number | null {
  return page?.hasMore ? page.limit : null;
}

export function useSobaAdmins(onError: (cause: unknown) => void) {
  const { data, isLoading, error, mutate } = useAuthedSWR(
    ['soba-admins'],
    (token) => fetchSobaAdmins(token, { limit: ADMIN_LIST_LIMIT }),
    reportOnce(onError),
  );

  const admins: SobaAdminItem[] = useMemo(() => data?.items ?? [], [data]);

  return { admins, truncatedAt: truncatedAt(data?.page), isLoading, error, refresh: mutate };
}

/** Only scopes for features this deployment scopes; the rest are not the admin's to manage. */
export function useFeatureScopes(allowedFeatureCodes: string[], onError: (cause: unknown) => void) {
  const { data, isLoading, error, mutate } = useAuthedSWR(
    allowedFeatureCodes.length > 0 ? ['feature-scopes'] : null,
    (token) => fetchFeatureScopes(token, { limit: SCOPE_LIST_LIMIT }),
    reportOnce(onError),
  );

  const allowed = useMemo(() => new Set(allowedFeatureCodes), [allowedFeatureCodes]);
  const featureScopes: FeatureScopeItem[] = useMemo(
    () => (data?.items ?? []).filter((item) => allowed.has(item.featureCode)),
    [data, allowed],
  );

  // A write the server accepted is applied to the cached rows rather than refetching the list.
  const updateItems = useCallback(
    (update: (items: FeatureScopeItem[]) => FeatureScopeItem[]) =>
      mutate((current) => (current ? { ...current, items: update(current.items) } : current), {
        revalidate: false,
      }),
    [mutate],
  );

  return {
    featureScopes,
    truncatedAt: truncatedAt(data?.page),
    isLoading,
    error,
    refresh: mutate,
    updateItems,
  };
}

export function useFeatureScope(
  featureScopeId: string | undefined,
  enabled: boolean,
  onError: (cause: unknown) => void,
) {
  const { data, isLoading, error } = useAuthedSWR(
    featureScopeId && enabled ? scopeKey(featureScopeId) : null,
    (token) => fetchFeatureScope(token, featureScopeId as string),
    reportOnce(onError),
  );

  const { cache } = useSWRConfig();
  useEffect(() => {
    if (!featureScopeId) return;
    // The record is read once to seed the form, which cannot re-seed itself. A cached copy would
    // seed the next visit from a status the save that just happened, or a toggle in the list, has
    // already moved on from, and saving there would write that stale status back. Dropping the
    // entry is what makes the next visit read the record again. `mutate(key, undefined)` reads as
    // "revalidate", not "forget", so the eviction goes through the cache itself.
    return () => {
      cache.delete(unstable_serialize(scopeKey(featureScopeId)));
    };
  }, [featureScopeId, cache]);

  return { featureScope: data ?? null, isLoading, error };
}
