import { describe, it, expect } from 'vitest';
import workspaceReducer, {
  loadWorkspaces,
  clearWorkspaceState,
  setCanceledDefaultModal,
  setSelectedWorkspaceId,
} from '@/lib/slices/workspaceSlice';
import type { WorkspaceState } from '@/lib/slices/workspaceSlice';
import { loadWritableWorkspaces } from '@/lib/slices/workspaceSlice';

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
  writableWorkspaces: [],
  status: 'idle',
  writableStatus: 'idle',
  error: null,
  canceledDefaultModal: false,
  selectedWorkspaceId: null,
};

describe('workspaceSlice', () => {
  it('clearWorkspaceState resets state', () => {
    const next = workspaceReducer(
      { ...baseState, workspaces: [workspace('w1')], status: 'succeeded' },
      clearWorkspaceState(),
    );
    expect(next.workspaces).toEqual([]);
    expect(next.writableWorkspaces).toEqual([]);
    expect(next.status).toBe('idle');
    expect(next.writableStatus).toBe('idle');
    expect(next.error).toBeNull();
    expect(next.selectedWorkspaceId).toBeNull();
  });

  it('setCanceledDefaultModal sets state', () => {
    const next = workspaceReducer(baseState, setCanceledDefaultModal(true));
    expect(next.canceledDefaultModal).toBe(true);
  });

  it('setSelectedWorkspaceId sets state', () => {
    const next = workspaceReducer(baseState, setSelectedWorkspaceId('w1'));
    expect(next.selectedWorkspaceId).toBe('w1');
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

  it('handles loadWritableWorkspaces.pending', () => {
    const next = workspaceReducer(baseState, { type: loadWritableWorkspaces.pending.type });
    expect(next.writableStatus).toBe('loading');
  });

  it('handles loadWritableWorkspaces.fulfilled', () => {
    const next = workspaceReducer(baseState, {
      type: loadWritableWorkspaces.fulfilled.type,
      payload: [workspace('w1')],
    });
    expect(next.writableStatus).toBe('succeeded');
    expect(next.writableWorkspaces).toHaveLength(1);
  });

  // parseJson casts the body without checking, so a malformed 200 must not put a non-array
  // into state — every consumer calls .filter/.some/.length on these straight away.
  it('keeps the lists as arrays when the response has no items', () => {
    const loaded = workspaceReducer(baseState, {
      type: loadWorkspaces.fulfilled.type,
      payload: undefined,
    });
    expect(loaded.workspaces).toEqual([]);

    const writable = workspaceReducer(baseState, {
      type: loadWritableWorkspaces.fulfilled.type,
      payload: undefined,
    });
    expect(writable.writableWorkspaces).toEqual([]);
  });

  it('handles loadWritableWorkspaces.rejected', () => {
    const next = workspaceReducer(baseState, {
      type: loadWritableWorkspaces.rejected.type,
      payload: 'Error loading',
    });
    expect(next.writableStatus).toBe('failed');
    expect(next.error).toBe('Error loading');
  });
});
