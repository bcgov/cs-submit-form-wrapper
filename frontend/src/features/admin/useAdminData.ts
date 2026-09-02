'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  fetchDocumentGenerationAudits,
  fetchFeatureScope,
  fetchFeatureScopes,
  fetchSobaAdmins,
} from '@/src/shared/api/sobaApiAdmin';
import { unstable_serialize, useSWRConfig } from 'swr';
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import { listReadConfig } from '@/src/shared/api/swrConfig';
import type { ListQueryArgs } from '@/src/types/list';
import type {
  DocumentGenerationAuditItem,
  FeatureScopeItem,
  FeatureScopesResponse,
  SobaAdminItem,
} from '@/src/types/admin';

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

export function useSobaAdmins(query: ListQueryArgs, onError: (cause: unknown) => void) {
  const { data, isLoading, error, mutate } = useAuthedSWR(
    ['soba-admins', query.offset, query.limit, query.sort, query.q ?? ''],
    (token) => fetchSobaAdmins(token, query),
    { ...listReadConfig, ...reportOnce(onError) },
  );

  const admins: SobaAdminItem[] = useMemo(() => data?.items ?? [], [data]);

  return { admins, total: data?.page?.total, isLoading, error, refresh: mutate };
}

/**
 * The server applies the allow-list, so the total it reports is the total the table can show.
 */
export function useFeatureScopes(
  allowedFeatureCodes: string[],
  query: ListQueryArgs,
  onError: (cause: unknown) => void,
) {
  const codes = useMemo(() => [...allowedFeatureCodes].sort().join(','), [allowedFeatureCodes]);
  const { data, isLoading, error, mutate } = useAuthedSWR(
    allowedFeatureCodes.length > 0
      ? ['feature-scopes', codes, query.offset, query.limit, query.sort, query.q ?? '']
      : null,
    (token) => fetchFeatureScopes(token, { ...query, featureCodes: allowedFeatureCodes }),
    { ...listReadConfig, ...reportOnce(onError) },
  );

  const featureScopes: FeatureScopeItem[] = useMemo(() => data?.items ?? [], [data]);

  // A write the server accepted is applied to the cached rows rather than refetching the list. The
  // total moves with them, because the table pages against it and would otherwise offer a page the
  // rows no longer fill.
  const updateItems = useCallback(
    (update: (items: FeatureScopeItem[]) => FeatureScopeItem[]) =>
      mutate(
        (current: FeatureScopesResponse | undefined) => {
          if (!current) return current;
          const items = update(current.items);
          const removed = current.items.length - items.length;
          return {
            ...current,
            items,
            page: { ...current.page, total: Math.max(0, current.page.total - removed) },
          };
        },
        { revalidate: false },
      ),
    [mutate],
  );

  return {
    featureScopes,
    total: data?.page?.total,
    isLoading,
    error,
    refresh: mutate,
    updateItems,
  };
}

/**
 * Audits for one workspace or form. The endpoint requires one of them, so there is no read until
 * the admin has searched.
 */
export function useDocumentGenerationAudits(
  filter: { workspaceId?: string; formId?: string } | null,
  query: ListQueryArgs,
  onError: (cause: unknown) => void,
) {
  const { data, isLoading, error } = useAuthedSWR(
    filter
      ? [
          'docgen-audits',
          filter.workspaceId ?? '',
          filter.formId ?? '',
          query.offset,
          query.limit,
          query.sort,
        ]
      : null,
    (token) => fetchDocumentGenerationAudits(token, { ...query, ...filter }),
    { ...listReadConfig, ...reportOnce(onError) },
  );

  const audits: DocumentGenerationAuditItem[] = useMemo(() => data?.items ?? [], [data]);

  return { audits, total: data?.page?.total, isLoading, error };
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
