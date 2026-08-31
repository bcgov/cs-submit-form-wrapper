import {
  featureEnvName,
  planFeatureFlagChanges,
  readFeatureStatus,
  unmatchedFlagNames,
} from '../../../src/core/db/featureFlags';
import { ValidationError } from '../../../src/core/errors';

const STATUSES = ['enabled', 'disabled', 'experimental', 'deprecated'];

describe('feature status from the environment', () => {
  it.each([
    ['dev-data', 'FEATURE_DEV_DATA_STATUS'],
    ['document-generation-v2', 'FEATURE_DOCUMENT_GENERATION_V2_STATUS'],
    ['files', 'FEATURE_FILES_STATUS'],
  ])('%s maps to %s', (code, expected) => {
    expect(featureEnvName(code)).toBe(expected);
  });

  it.each([
    [undefined, undefined],
    ['', undefined],
    ['   ', undefined],
    ['enabled', 'enabled'],
    ['  ENABLED  ', 'enabled'],
    ['experimental', 'experimental'],
  ])('reads %p as %p', (raw, expected) => {
    expect(readFeatureStatus({ FEATURE_DEV_DATA_STATUS: raw }, 'dev-data')).toBe(expected);
  });

  it('writes nothing when the environment has no opinion', () => {
    const rows = [{ code: 'dev-data', status: 'disabled' }];
    expect(planFeatureFlagChanges({}, rows, STATUSES)).toEqual([]);
    expect(planFeatureFlagChanges({ FEATURE_DEV_DATA_STATUS: '' }, rows, STATUSES)).toEqual([]);
  });

  it('writes nothing when the row already has that status', () => {
    expect(
      planFeatureFlagChanges(
        { FEATURE_DEV_DATA_STATUS: 'enabled' },
        [{ code: 'dev-data', status: 'enabled' }],
        STATUSES,
      ),
    ).toEqual([]);
  });

  it('reports the transition it will make', () => {
    expect(
      planFeatureFlagChanges(
        { FEATURE_DEV_DATA_STATUS: 'enabled' },
        [{ code: 'dev-data', status: 'disabled' }],
        STATUSES,
      ),
    ).toEqual([{ code: 'dev-data', from: 'disabled', to: 'enabled' }]);
  });

  it('sets statuses a boolean could not express', () => {
    expect(
      planFeatureFlagChanges(
        { FEATURE_FILES_STATUS: 'experimental' },
        [{ code: 'files', status: 'enabled' }],
        STATUSES,
      ),
    ).toEqual([{ code: 'files', from: 'enabled', to: 'experimental' }]);

    expect(
      planFeatureFlagChanges(
        { FEATURE_FILES_STATUS: 'deprecated' },
        [{ code: 'files', status: 'experimental' }],
        STATUSES,
      ),
    ).toEqual([{ code: 'files', from: 'experimental', to: 'deprecated' }]);
  });

  it('refuses a status the code table does not have', () => {
    // A typo would otherwise leave the environment quietly in the wrong state.
    expect(() =>
      planFeatureFlagChanges(
        { FEATURE_DEV_DATA_STATUS: 'enable' },
        [{ code: 'dev-data', status: 'disabled' }],
        STATUSES,
      ),
    ).toThrow(ValidationError);
  });

  it('reports flag-shaped names that match no feature', () => {
    const source = {
      FEATURE_DEV_DATA_STATUS: 'enabled',
      FEATURE_TYPPO_STATUS: 'enabled',
      DATABASE_URL: 'x',
    };
    expect(unmatchedFlagNames(source, ['dev-data'])).toEqual(['FEATURE_TYPPO_STATUS']);
  });
});
