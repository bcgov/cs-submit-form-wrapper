const selectMock = jest.fn();

jest.mock('../../../../src/core/db/client', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

import { listFormsForWorkspace } from '../../../../src/core/db/repos/formRepo';
import { listFormVersionsForWorkspace } from '../../../../src/core/db/repos/formVersionRepo';

// Empty scope means no access; without the guard the workspace filter is dropped and every row leaks.
describe('list repos reject an empty workspace scope', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('listFormsForWorkspace returns nothing without querying', async () => {
    await expect(
      listFormsForWorkspace({
        workspaceIds: [],
        limit: 20,
        sort: 'id:desc',
        cursorMode: 'id',
      }),
    ).resolves.toEqual({ items: [], hasMore: false });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('listFormVersionsForWorkspace returns nothing without querying', async () => {
    await expect(
      listFormVersionsForWorkspace({
        workspaceIds: [],
        limit: 20,
        sort: 'id:desc',
        cursorMode: 'id',
      }),
    ).resolves.toEqual({ items: [], hasMore: false });
    expect(selectMock).not.toHaveBeenCalled();
  });
});
