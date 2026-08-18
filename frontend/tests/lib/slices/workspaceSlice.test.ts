import { describe, it, expect, beforeEach, vi } from 'vitest';
import workspaceReducer, {
  loadWorkspaces,
  pickWorkspaceToEstablish,
  setActiveWorkspaceId,
  clearWorkspaceState,
} from '@/lib/slices/workspaceSlice';
import type { WorkspaceState } from '@/lib/slices/workspaceSlice';

const STORAGE_KEY = 'soba.workspaceId';

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
  activeWorkspaceId: null,
  status: 'idle',
  error: null,
  canceledDefaultModal: false,
};

describe('workspaceSlice', () => {
  beforeEach(() => {
    globalThis.sessionStorage.clear();
  });

  it('pickWorkspaceToEstablish selects the sole workspace', () => {
    expect(pickWorkspaceToEstablish([workspace('only')])).toEqual(workspace('only'));
  });

  it('pickWorkspaceToEstablish prefers stored default workspace when valid', () => {
    const personal = workspace('p1');
    personal.kind = 'personal';
    const enterprise = workspace('e1');
    enterprise.kind = 'enterprise';
    expect(pickWorkspaceToEstablish([personal, enterprise], 'e1')).toEqual(enterprise);
  });

  it('pickWorkspaceToEstablish ignores invalid default workspace id', () => {
    const personal = workspace('p1');
    personal.kind = 'personal';
    const enterprise = workspace('e1');
    enterprise.kind = 'enterprise';
    expect(pickWorkspaceToEstablish([personal, enterprise], 'missing')).toEqual(personal);
  });

  it('pickWorkspaceToEstablish prefers personal when several exist', () => {
    const personal = workspace('p1');
    personal.kind = 'personal';
    const enterprise = workspace('e1');
    enterprise.kind = 'enterprise';
    expect(pickWorkspaceToEstablish([enterprise, personal])).toEqual(personal);
  });

  it('pickWorkspaceToEstablish returns null when several exist and none is personal', () => {
    const a = workspace('a1');
    a.kind = 'enterprise';
    const b = workspace('b1');
    b.kind = 'enterprise';
    expect(pickWorkspaceToEstablish([a, b])).toBeNull();
  });

  it('does not auto-pick a workspace when the list loads', () => {
    const next = workspaceReducer(baseState, {
      type: loadWorkspaces.fulfilled.type,
      payload: [workspace('w1'), workspace('w2')],
    });
    expect(next.activeWorkspaceId).toBeNull();
    expect(next.workspaces).toHaveLength(2);
    expect(next.status).toBe('succeeded');
  });

  it('drops a stale active workspace that is no longer in the loaded list', () => {
    const next = workspaceReducer(
      { ...baseState, activeWorkspaceId: 'gone' },
      { type: loadWorkspaces.fulfilled.type, payload: [workspace('w1')] },
    );
    expect(next.activeWorkspaceId).toBeNull();
  });

  it('keeps a valid active workspace present in the loaded list', () => {
    const next = workspaceReducer(
      { ...baseState, activeWorkspaceId: 'w1' },
      { type: loadWorkspaces.fulfilled.type, payload: [workspace('w1'), workspace('w2')] },
    );
    expect(next.activeWorkspaceId).toBe('w1');
  });

  it('setActiveWorkspaceId mirrors the resolved value', () => {
    const next = workspaceReducer(baseState, setActiveWorkspaceId('w9'));
    expect(next.activeWorkspaceId).toBe('w9');
  });

  it('clearWorkspaceState resets state and clears the per-tab store', () => {
    globalThis.sessionStorage.setItem(STORAGE_KEY, 'w1');
    const next = workspaceReducer(
      { ...baseState, activeWorkspaceId: 'w1', workspaces: [workspace('w1')] },
      clearWorkspaceState(),
    );
    expect(next.activeWorkspaceId).toBeNull();
    expect(next.workspaces).toEqual([]);
    expect(globalThis.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('hydrates activeWorkspaceId from the per-tab store on init', async () => {
    globalThis.sessionStorage.setItem(STORAGE_KEY, 'wsHydrated');
    vi.resetModules();
    const mod = await import('@/lib/slices/workspaceSlice');
    const state = mod.default(undefined, { type: '@@redux/INIT' });
    expect(state.activeWorkspaceId).toBe('wsHydrated');
  });
});
