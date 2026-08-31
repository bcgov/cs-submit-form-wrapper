'use client';

import { useSWRConfig } from 'swr';
import { useCallback } from 'react';
import { fetchWorkspaces } from './sobaApi';
import { useAuthedSWR } from './useAuthedSWR';
import { listReadConfig, sessionReadConfig } from './swrConfig';
import { EMPTY_LIST_PAGE, type ListPage, type ListQueryArgs } from '@/src/types/list';
import type { WorkspaceItem } from '@/src/types/workspaces';

/**
 * Pickers and permission gates need every workspace at once, not a page of them. This is the
 * endpoint's cap, so a user in more workspaces than this sees a truncated picker.
 */
const PICKER_LIMIT = 100;
const PICKER_QUERY = { offset: 0, limit: PICKER_LIMIT, sort: 'name:asc' as const };

const WORKSPACES_KEY = ['workspaces'] as const;
const WRITABLE_KEY = ['workspaces', 'design_create'] as const;

const EMPTY: WorkspaceItem[] = [];

const toItems = (items: unknown): WorkspaceItem[] => (Array.isArray(items) ? items : EMPTY);

export function useWorkspaces() {
  const { data, isLoading, error, mutate } = useAuthedSWR<WorkspaceItem[]>(
    WORKSPACES_KEY,
    async (token) => toItems((await fetchWorkspaces(token, PICKER_QUERY)).items),
    sessionReadConfig,
  );
  return { workspaces: data ?? EMPTY, loaded: data !== undefined, isLoading, error, mutate };
}

/** Workspaces the user can create forms in. Carries the disclaimer flag that gates creation. */
export function useWritableWorkspaces() {
  const { data, isLoading, error, mutate } = useAuthedSWR<WorkspaceItem[]>(
    WRITABLE_KEY,
    async (token) =>
      toItems(
        (await fetchWorkspaces(token, { ...PICKER_QUERY, requiredPermission: 'design_create' }))
          .items,
      ),
    sessionReadConfig,
  );
  return { workspaces: data ?? EMPTY, loaded: data !== undefined, isLoading, error, mutate };
}

/**
 * One page of workspaces for the list screen. Not a session read: it revalidates normally, so a
 * workspace created or renamed on another screen shows up on the way back.
 */
export function useWorkspaceList(query: ListQueryArgs) {
  const { data, isLoading, error } = useAuthedSWR<{ items: WorkspaceItem[]; page: ListPage }>(
    ['workspaces', 'list', query.offset, query.limit, query.sort, query.q ?? ''],
    async (token) => {
      const response = await fetchWorkspaces(token, query);
      return { items: toItems(response.items), page: response.page ?? EMPTY_LIST_PAGE };
    },
    listReadConfig,
  );
  return {
    workspaces: data?.items ?? EMPTY,
    total: data?.page.total,
    isLoading,
    error,
  };
}

/**
 * Every workspace read after a workspace write: the pickers and whichever page the list screen is
 * showing. The writable list carries the disclaimer flag, so it goes stale on the same edits.
 */
export function useRefreshWorkspaces() {
  const { mutate } = useSWRConfig();
  return useCallback(
    () => mutate((key) => Array.isArray(key) && key[0] === WORKSPACES_KEY[0]),
    [mutate],
  );
}
