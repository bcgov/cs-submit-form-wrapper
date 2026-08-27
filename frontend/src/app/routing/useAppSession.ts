'use client';

import { useEffect, useMemo } from 'react';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { loadCurrentUser } from '@/lib/slices/currentUserSlice';
import { loadWorkspaces, loadWritableWorkspaces } from '@/lib/slices/workspaceSlice';
import { needsWorkspaceOnboarding } from '@/src/features/onboarding/workspaceOnboarding';
import type { AppSessionSnapshot } from './appRoutePolicy';

export function useAppSession(): AppSessionSnapshot {
  const { authenticated, token, initializing, initStarted } = useKeycloak();
  const dispatch = useAppDispatch();

  const {
    workspaces,
    status: workspaceStatus,
    writableStatus,
    loadedOnce: workspacesLoadedOnce,
    writableLoadedOnce,
  } = useAppSelector((state) => state.workspace);
  const {
    data: currentUser,
    status: currentUserStatus,
    loadedOnce: currentUserLoadedOnce,
  } = useAppSelector((state) => state.currentUser);

  useEffect(() => {
    if (authenticated && token && workspaceStatus === 'idle') {
      dispatch(loadWorkspaces(token));
    }
    if (authenticated && token && writableStatus === 'idle') {
      dispatch(loadWritableWorkspaces(token));
    }
  }, [authenticated, token, workspaceStatus, writableStatus, dispatch]);

  useEffect(() => {
    if (authenticated && token && currentUserStatus === 'idle') {
      dispatch(loadCurrentUser(token));
    }
  }, [authenticated, token, currentUserStatus, dispatch]);

  return useMemo(() => {
    // The same three loads throughout: one that can fail the session has to be waited for too.
    const sessionReady = authenticated
      ? !initializing &&
        workspaceStatus === 'succeeded' &&
        writableStatus === 'succeeded' &&
        currentUserStatus === 'succeeded'
      : !initializing;

    const sessionFailed =
      authenticated && (workspaceStatus === 'failed' || writableStatus === 'failed' || currentUserStatus === 'failed');

    const needsOnboarding = needsWorkspaceOnboarding({
      authenticated,
      initializing,
      workspaceStatus,
      currentUserStatus,
      workspaces,
      currentUser,
    });

    return {
      authenticated,
      initializing,
      initStarted,
      sessionReady,
      // Data survives a refetch, so this stays true through a background reload; the guard uses it
      // to avoid unmounting the route. Miss a load here and its failure never reaches the user.
      sessionLoadedOnce: workspacesLoadedOnce && writableLoadedOnce && currentUserLoadedOnce,
      sessionFailed,
      needsOnboarding,
      canCreateWorkspace: currentUser?.capabilities?.canCreateWorkspace === true,
      hasWorkspaces: workspaces.length > 0,
    };
  }, [
    authenticated,
    initializing,
    initStarted,
    workspaceStatus,
    workspacesLoadedOnce,
    writableLoadedOnce,
    writableStatus,
    currentUserStatus,
    currentUserLoadedOnce,
    workspaces,
    currentUser,
  ]);
}
