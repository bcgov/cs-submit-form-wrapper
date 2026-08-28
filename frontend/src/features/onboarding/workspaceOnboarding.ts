import type { CurrentUserResponse } from '@/src/types/user';
import type { WorkspaceItem } from '@/src/types/workspaces';

type WorkspaceOnboardingInput = {
  authenticated: boolean;
  initializing: boolean;
  workspacesLoaded: boolean;
  currentUserStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  workspaces: WorkspaceItem[];
  currentUser: CurrentUserResponse | null;
};

/** Signed-in user with no workspace access and no path to create a workspace. */
export function needsWorkspaceOnboarding({
  authenticated,
  initializing,
  workspacesLoaded,
  currentUserStatus,
  workspaces,
  currentUser,
}: WorkspaceOnboardingInput): boolean {
  if (!authenticated || initializing) return false;
  if (!workspacesLoaded || currentUserStatus !== 'succeeded') return false;
  if (workspaces.length > 0) return false;
  return currentUser?.capabilities?.canCreateWorkspace !== true;
}
