'use client';

import { useEffect, useMemo } from 'react';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { loadCurrentUser } from '@/lib/slices/currentUserSlice';
import { useWorkspaces, useWritableWorkspaces } from '@/src/shared/api/useWorkspaces';
import { needsWorkspaceOnboarding } from '@/src/features/onboarding/workspaceOnboarding';
import type { AppSessionSnapshot } from './appRoutePolicy';

export function useAppSession(): AppSessionSnapshot {
  const { authenticated, token, initializing, initStarted } = useKeycloak();
  const dispatch = useAppDispatch();

  const { workspaces, loaded: workspacesLoaded, error: workspacesError } = useWorkspaces();
  const { loaded: writableLoaded, error: writableError } = useWritableWorkspaces();
  const {
    data: currentUser,
    status: currentUserStatus,
    loadedOnce: currentUserLoadedOnce,
  } = useAppSelector((state) => state.currentUser);

  useEffect(() => {
    if (authenticated && token && currentUserStatus === 'idle') {
      dispatch(loadCurrentUser(token));
    }
  }, [authenticated, token, currentUserStatus, dispatch]);

  // Survives a failed reload: SWR keeps the last data on error, and the slice keeps its own flag.
  // Both only reset when the session ends, which is when the guard should stop rendering the route
  // anyway. This is why the reads must not be keyed on the token - a rotation would clear them.
  const loadedOnce = workspacesLoaded && writableLoaded && currentUserLoadedOnce;

  return useMemo(() => {
    // The same three loads throughout: one that can fail the session has to be waited for too.
    const sessionReady = authenticated
      ? !initializing &&
        workspacesLoaded &&
        !workspacesError &&
        writableLoaded &&
        !writableError &&
        currentUserStatus === 'succeeded'
      : !initializing;

    const sessionFailed =
      authenticated && (!!workspacesError || !!writableError || currentUserStatus === 'failed');

    const needsOnboarding = needsWorkspaceOnboarding({
      authenticated,
      initializing,
      workspacesLoaded,
      currentUserStatus,
      workspaces,
      currentUser,
    });

    return {
      authenticated,
      initializing,
      initStarted,
      sessionReady,
      sessionLoadedOnce: loadedOnce,
      sessionFailed,
      needsOnboarding,
      canCreateWorkspace: currentUser?.capabilities?.canCreateWorkspace === true,
      hasWorkspaces: workspaces.length > 0,
    };
  }, [
    authenticated,
    initializing,
    initStarted,
    workspacesLoaded,
    workspacesError,
    writableLoaded,
    writableError,
    currentUserStatus,
    loadedOnce,
    workspaces,
    currentUser,
  ]);
}
