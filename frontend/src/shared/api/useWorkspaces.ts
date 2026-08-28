'use client';

import { useSWRConfig } from 'swr';
import { useCallback } from 'react';
import { fetchWorkspaces } from './sobaApi';
import { useAuthedSWR } from './useAuthedSWR';
import { sessionReadConfig } from './swrConfig';
import type { WorkspaceItem } from '@/src/types/workspaces';

const WORKSPACES_KEY = ['workspaces'] as const;
const WRITABLE_KEY = ['workspaces', 'design_create'] as const;

const EMPTY: WorkspaceItem[] = [];

const toItems = (items: unknown): WorkspaceItem[] => (Array.isArray(items) ? items : EMPTY);

export function useWorkspaces() {
  const { data, isLoading, error, mutate } = useAuthedSWR<WorkspaceItem[]>(
    WORKSPACES_KEY,
    async (token) => toItems((await fetchWorkspaces(token)).items),
    sessionReadConfig,
  );
  return { workspaces: data ?? EMPTY, loaded: data !== undefined, isLoading, error, mutate };
}

/** Workspaces the user can create forms in. Carries the disclaimer flag that gates creation. */
export function useWritableWorkspaces() {
  const { data, isLoading, error, mutate } = useAuthedSWR<WorkspaceItem[]>(
    WRITABLE_KEY,
    async (token) => toItems((await fetchWorkspaces(token, 'design_create')).items),
    sessionReadConfig,
  );
  return { workspaces: data ?? EMPTY, loaded: data !== undefined, isLoading, error, mutate };
}

/**
 * Both lists after a workspace write. The writable list carries the disclaimer flag, so it goes
 * stale on the same edits as the full list.
 */
export function useRefreshWorkspaces() {
  const { mutate } = useSWRConfig();
  return useCallback(
    () => Promise.all([mutate(WORKSPACES_KEY), mutate(WRITABLE_KEY)]),
    [mutate],
  );
}
