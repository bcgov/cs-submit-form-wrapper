'use client';

import { useSWRConfig } from 'swr';
import { useCallback } from 'react';
import { fetchWorkspaces } from './sobaApi';
import { useAuthedSWR } from './useAuthedSWR';
import type { WorkspaceItem } from '@/src/types/workspaces';

const WORKSPACES_KEY = ['workspaces'] as const;
const WRITABLE_KEY = ['workspaces', 'design_create'] as const;

const EMPTY: WorkspaceItem[] = [];

/**
 * The route policy reads these, so an ambient refetch answering with an empty list would redirect a
 * signed-in user to onboarding. They are read once and re-read only through `refreshWorkspaces`.
 */
const SESSION_READ = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
};

// parseJson casts the body unchecked, so a malformed 200 can land a non-array here.
const toItems = (items: unknown): WorkspaceItem[] => (Array.isArray(items) ? items : EMPTY);

export function useWorkspaces() {
  const { data, isLoading, error, mutate } = useAuthedSWR<WorkspaceItem[]>(
    WORKSPACES_KEY,
    async (token) => toItems((await fetchWorkspaces(token)).items),
    SESSION_READ,
  );
  return { workspaces: data ?? EMPTY, loaded: data !== undefined, isLoading, error, mutate };
}

/** Workspaces the user can create forms in. Carries the disclaimer flag that gates creation. */
export function useWritableWorkspaces() {
  const { data, isLoading, error, mutate } = useAuthedSWR<WorkspaceItem[]>(
    WRITABLE_KEY,
    async (token) => toItems((await fetchWorkspaces(token, 'design_create')).items),
    SESSION_READ,
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
