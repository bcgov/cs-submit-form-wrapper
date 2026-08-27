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

describe('featureScopeRepo.hasActiveFeatureGrant', () => {
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

  it('lists feature scopes through the expected select chain', async () => {
    const limitMock = jest.fn().mockResolvedValue([{ id: 'scope-1' }]);
    const orderByMock = jest.fn(() => ({ limit: limitMock }));
    const whereMock = jest.fn(() => ({ orderBy: orderByMock }));
    const fromMock = jest.fn(() => ({ where: whereMock }));
    selectMock.mockReturnValue({ from: fromMock });

    await expect(
      listFeatureScopes({ featureCode: 'document-generation-v3', status: 'active', limit: 25 }),
    ).resolves.toEqual([{ id: 'scope-1' }]);

    expect(selectMock).toHaveBeenCalledWith();
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(whereMock).toHaveBeenCalledTimes(1);
    expect(orderByMock).toHaveBeenCalledTimes(1);
    expect(limitMock).toHaveBeenCalledWith(25);
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

  it('deletes a feature scope by id', async () => {
    const whereMock = jest.fn().mockResolvedValue(undefined);
    deleteMock.mockReturnValue({ where: whereMock });

    await expect(removeFeatureScope('scope-1')).resolves.toBeUndefined();

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(whereMock).toHaveBeenCalledTimes(1);
  });
});
