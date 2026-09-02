'use client';

import { useMemo } from 'react';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useWorkspaces, useWritableWorkspaces } from '@/src/shared/api/useWorkspaces';
import { useCurrentUser } from '@/src/shared/api/useCurrentUser';
import { needsWorkspaceOnboarding } from '@/src/features/onboarding/workspaceOnboarding';
import type { AppSessionSnapshot } from './appRoutePolicy';

export function useAppSession(): AppSessionSnapshot {
  const { authenticated, initializing, initStarted } = useKeycloak();

  const { workspaces, loaded: workspacesLoaded, error: workspacesError } = useWorkspaces();
  const { loaded: writableLoaded, error: writableError } = useWritableWorkspaces();
  const {
    data: currentUser,
    loaded: currentUserLoaded,
    error: currentUserError,
  } = useCurrentUser();

  // SWR keeps the last data on error, so this survives a failed reload and resets only when the
  // session ends.
  const loadedOnce = workspacesLoaded && writableLoaded && currentUserLoaded;

  return useMemo(() => {
    // The same three loads throughout: one that can fail the session has to be waited for too.
    const sessionReady = authenticated
      ? !initializing &&
        workspacesLoaded &&
        !workspacesError &&
        writableLoaded &&
        !writableError &&
        currentUserLoaded &&
        !currentUserError
      : !initializing;

    const sessionFailed =
      authenticated && (!!workspacesError || !!writableError || !!currentUserError);

    const needsOnboarding = needsWorkspaceOnboarding({
      authenticated,
      initializing,
      workspacesLoaded,
      currentUserLoaded,
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
    currentUserLoaded,
    currentUserError,
    loadedOnce,
    workspaces,
    currentUser,
  ]);
}
