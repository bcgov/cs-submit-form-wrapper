import type { CurrentUserResponse } from '@/src/types/user';
import type { WorkspaceItem } from '@/src/types/workspaces';

type WorkspaceOnboardingInput = {
  authenticated: boolean;
  initializing: boolean;
  workspacesLoaded: boolean;
  currentUserLoaded: boolean;
  workspaces: WorkspaceItem[];
  currentUser: CurrentUserResponse | null;
};

/** Signed-in user with no workspace access and no path to create a workspace. */
export function needsWorkspaceOnboarding({
  authenticated,
  initializing,
  workspacesLoaded,
  currentUserLoaded,
  workspaces,
  currentUser,
}: WorkspaceOnboardingInput): boolean {
  if (!authenticated || initializing) return false;
  if (!workspacesLoaded || !currentUserLoaded) return false;
  if (workspaces.length > 0) return false;
  return currentUser?.capabilities?.canCreateWorkspace !== true;
}
