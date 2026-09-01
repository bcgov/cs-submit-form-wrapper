const selectMock = jest.fn();
const deleteMock = jest.fn();

jest.mock('../../../../src/core/db/client', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

import {
  getFeatureScopeById,
  hasActiveFeatureGrant,
  listFeatureScopes,
  removeFeatureScope,
} from '../../../../src/core/db/repos/featureScopeRepo';

describe('featureScopeRepo', () => {
  beforeEach(() => {
    selectMock.mockReset();
    deleteMock.mockReset();
  });

  // Without a scope id there is nothing to match; querying anyway would risk matching an unrelated
  // grant for the same feature, so the guard must short-circuit before touching the DB.
  it('returns false without querying when neither workspace nor form id is supplied', async () => {
    await expect(hasActiveFeatureGrant({ featureCode: 'document-generation-v3' })).resolves.toBe(
      false,
    );
    expect(selectMock).not.toHaveBeenCalled();
  });

  const stubList = (rows: { id: string }[]) => {
    const limitMock = jest.fn().mockResolvedValue(rows);
    const orderByMock = jest.fn(() => ({ limit: limitMock }));
    const whereMock = jest.fn(() => ({ orderBy: orderByMock }));
    selectMock.mockReturnValue({ from: jest.fn(() => ({ where: whereMock })) });
    return limitMock;
  };

  it('trims the lookahead row and reports the list as truncated', async () => {
    const limitMock = stubList([{ id: 'scope-1' }, { id: 'scope-2' }, { id: 'scope-3' }]);

    await expect(listFeatureScopes({ limit: 2 })).resolves.toEqual({
      items: [{ id: 'scope-1' }, { id: 'scope-2' }],
      hasMore: true,
    });
    expect(limitMock).toHaveBeenCalledWith(3);
  });

  it('reports a short list as complete', async () => {
    stubList([{ id: 'scope-1' }]);

    await expect(listFeatureScopes({ limit: 2 })).resolves.toEqual({
      items: [{ id: 'scope-1' }],
      hasMore: false,
    });
  });

  it('gets a feature scope by id', async () => {
    const row = { id: 'scope-1' };
    const limitMock = jest.fn().mockResolvedValue([row]);
    const whereMock = jest.fn(() => ({ limit: limitMock }));
    const fromMock = jest.fn(() => ({ where: whereMock }));
    selectMock.mockReturnValue({ from: fromMock });

    await expect(getFeatureScopeById('scope-1')).resolves.toBe(row);

    expect(limitMock).toHaveBeenCalledWith(1);
  });

  it('returns null when a feature scope id is not found', async () => {
    const limitMock = jest.fn().mockResolvedValue([]);
    const whereMock = jest.fn(() => ({ limit: limitMock }));
    const fromMock = jest.fn(() => ({ where: whereMock }));
    selectMock.mockReturnValue({ from: fromMock });

    await expect(getFeatureScopeById('scope-1')).resolves.toBeNull();
  });

  const stubDelete = (deleted: { id: string }[]) => {
    const returningMock = jest.fn().mockResolvedValue(deleted);
    deleteMock.mockReturnValue({ where: jest.fn(() => ({ returning: returningMock })) });
  };

  it('reports a deleted feature scope', async () => {
    stubDelete([{ id: 'scope-1' }]);

    await expect(removeFeatureScope('scope-1')).resolves.toBe(true);
  });

  it('reports an id that matched no feature scope', async () => {
    stubDelete([]);

    await expect(removeFeatureScope('scope-1')).resolves.toBe(false);
  });
});
