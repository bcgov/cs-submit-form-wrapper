import { describe, it, expect } from 'vitest';
import workspaceReducer, {
  loadWorkspaces,
  clearWorkspaceState,
  setCanceledDefaultModal,
} from '@/lib/slices/workspaceSlice';
import type { WorkspaceState } from '@/lib/slices/workspaceSlice';

const workspace = (id: string) => ({
  id,
  name: `Workspace ${id}`,
  kind: 'personal',
  role: 'owner',
  status: 'active',
  disclaimerAccepted: false,
  useCase: 'other',
  org: 'other',
});

const baseState: WorkspaceState = {
  workspaces: [],
  status: 'idle',
  error: null,
  canceledDefaultModal: false,
};

describe('workspaceSlice', () => {
  it('clearWorkspaceState resets state', () => {
    const next = workspaceReducer(
      { ...baseState, workspaces: [workspace('w1')], status: 'succeeded' },
      clearWorkspaceState(),
    );
    expect(next.workspaces).toEqual([]);
    expect(next.status).toBe('idle');
    expect(next.error).toBeNull();
  });

  it('setCanceledDefaultModal sets state', () => {
    const next = workspaceReducer(baseState, setCanceledDefaultModal(true));
    expect(next.canceledDefaultModal).toBe(true);
  });

  it('handles loadWorkspaces.pending', () => {
    const next = workspaceReducer(baseState, { type: loadWorkspaces.pending.type });
    expect(next.status).toBe('loading');
  });

  it('handles loadWorkspaces.fulfilled', () => {
    const next = workspaceReducer(baseState, {
      type: loadWorkspaces.fulfilled.type,
      payload: [workspace('w1'), workspace('w2')],
    });
    expect(next.status).toBe('succeeded');
    expect(next.workspaces).toHaveLength(2);
  });

  it('handles loadWorkspaces.rejected', () => {
    const next = workspaceReducer(baseState, {
      type: loadWorkspaces.rejected.type,
      payload: 'Error loading',
    });
    expect(next.status).toBe('failed');
    expect(next.error).toBe('Error loading');
  });
});
