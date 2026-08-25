import { idsFromRuns } from '../../../src/features/dev-data/runs';

const run = (workspaceIds: string[], userIds: string[] = []) => ({
  id: `run-${workspaceIds.join('')}`,
  ids: { workspaceIds, userIds },
});

describe('ids recorded by a run', () => {
  it('collects what one run created', () => {
    expect(idsFromRuns([run(['w1', 'w2'], ['u1'])])).toEqual({
      workspaceIds: ['w1', 'w2'],
      userIds: ['u1'],
    });
  });

  it('merges runs and drops duplicates', () => {
    expect(idsFromRuns([run(['w1'], ['u1']), run(['w1', 'w2'], ['u2'])])).toEqual({
      workspaceIds: ['w1', 'w2'],
      userIds: ['u1', 'u2'],
    });
  });

  it('is empty for a run that recorded nothing', () => {
    // A run that died before creating anything still has a row; it just has nothing to purge.
    expect(idsFromRuns([run([], [])])).toEqual({ workspaceIds: [], userIds: [] });
    expect(idsFromRuns([])).toEqual({ workspaceIds: [], userIds: [] });
  });

  it('keeps the ids of a run that only got part way', () => {
    expect(idsFromRuns([run(['w1'], ['u1', 'u2'])])).toEqual({
      workspaceIds: ['w1'],
      userIds: ['u1', 'u2'],
    });
  });
});
