import { describe, it, expect } from 'vitest';
import { needsWorkspaceOnboarding } from '@/src/features/onboarding/workspaceOnboarding';

const readyContext = {
  authenticated: true,
  initializing: false,
  workspaceStatus: 'succeeded' as const,
  currentUserStatus: 'succeeded' as const,
};

describe('workspaceOnboarding', () => {
  it('needsWorkspaceOnboarding when signed in with no workspaces and cannot create', () => {
    expect(
      needsWorkspaceOnboarding({
        ...readyContext,
        workspaces: [],
        currentUser: {
          actor: { id: 'u1', displayLabel: 'User', status: 'active' },
          profile: { displayName: 'User', email: null, preferredUsername: null },
          preferences: { defaultWorkspaceId: null },
          capabilities: { canCreateWorkspace: false, isSobaAdmin: false },
        },
      }),
    ).toBe(true);
  });

  it('does not need onboarding when the user can create a workspace', () => {
    expect(
      needsWorkspaceOnboarding({
        ...readyContext,
        workspaces: [],
        currentUser: {
          actor: { id: 'u1', displayLabel: 'User', status: 'active' },
          profile: { displayName: 'User', email: null, preferredUsername: null },
          preferences: { defaultWorkspaceId: null },
          capabilities: { canCreateWorkspace: true, isSobaAdmin: false },
        },
      }),
    ).toBe(false);
  });

  it('does not need onboarding when the user already has workspaces', () => {
    expect(
      needsWorkspaceOnboarding({
        ...readyContext,
        workspaces: [
          {
            id: 'ws1',
            name: 'Team',
            kind: 'team',
            role: 'member',
            status: 'active',
            disclaimerAccepted: false,
            useCase: 'other',
            org: 'other',
          },
        ],
        currentUser: {
          actor: { id: 'u1', displayLabel: 'User', status: 'active' },
          profile: { displayName: 'User', email: null, preferredUsername: null },
          preferences: { defaultWorkspaceId: null },
          capabilities: { canCreateWorkspace: false, isSobaAdmin: false },
        },
      }),
    ).toBe(false);
  });
});
