const selectMock = jest.fn();

jest.mock('../../../../src/core/db/client', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

import { listFormsForWorkspace } from '../../../../src/core/db/repos/formRepo';
import { listFormVersionsForWorkspace } from '../../../../src/core/db/repos/formVersionRepo';
import { listSubmissionsForWorkspace } from '../../../../src/core/db/repos/submissionRepo';

// Empty scope means no access; without the guard the workspace filter is dropped and every row leaks.
describe('list repos reject an empty workspace scope', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('listFormsForWorkspace returns nothing without querying', async () => {
    await expect(
      listFormsForWorkspace({
        workspaceIds: [],
        offset: 0,
        limit: 20,
        sort: 'createdAt:desc',
      }),
    ).resolves.toEqual({ items: [], total: 0 });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('listFormVersionsForWorkspace returns nothing without querying', async () => {
    await expect(
      listFormVersionsForWorkspace({
        workspaceIds: [],
        offset: 0,
        limit: 20,
        sort: 'versionNo:desc',
      }),
    ).resolves.toEqual({ items: [], total: 0 });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('listSubmissionsForWorkspace returns nothing without querying', async () => {
    await expect(
      listSubmissionsForWorkspace({
        workspaceIds: [],
        offset: 0,
        limit: 20,
        sort: 'updatedAt:desc',
      }),
    ).resolves.toEqual({ items: [], total: 0 });
    expect(selectMock).not.toHaveBeenCalled();
  });
});
