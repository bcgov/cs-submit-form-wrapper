import { describe, expect, it } from 'vitest';
import { formatAppVersion, isRuntimeConfigPayload } from '@/src/shared/config/runtimeConfig';

describe('isRuntimeConfigPayload', () => {
  it('validates expected payload shape', () => {
    const validPayload = {
      auth: {
        provider: 'keycloak',
        idpPluginDefaultCode: 'bcgov-sso',
        keycloak: {
          url: 'https://dev.loginproxy.gov.bc.ca/auth',
          realm: 'standard',
          clientId: 'connected-services-submit-6349',
          pkceMethod: 'S256',
        },
      },
      api: {
        baseUrl: 'http://localhost:4000/api/v1',
      },
      build: {
        name: 'soba-ui',
        version: '0.1.0',
      },
    };
    expect(isRuntimeConfigPayload(validPayload)).toBe(true);
    expect(isRuntimeConfigPayload({ auth: {}, api: {} })).toBe(false);
  });

  it('rejects a payload missing the build block', () => {
    const noBuild = {
      auth: {
        provider: 'keycloak',
        idpPluginDefaultCode: 'bcgov-sso',
        keycloak: {
          url: 'https://dev.loginproxy.gov.bc.ca/auth',
          realm: 'standard',
          clientId: 'connected-services-submit-6349',
          pkceMethod: 'S256',
        },
      },
      api: { baseUrl: 'http://localhost:4000/api/v1' },
    };
    expect(isRuntimeConfigPayload(noBuild)).toBe(false);
  });
});

describe('formatAppVersion', () => {
  it('appends the sha as semver build metadata', () => {
    expect(formatAppVersion({ name: 'soba-ui', version: '2.0.0-beta.1', gitSha: 'abc1234' })).toBe(
      '2.0.0-beta.1+abc1234',
    );
  });

  it('leaves a version that already carries build metadata untouched', () => {
    expect(
      formatAppVersion({
        name: 'soba-ui',
        version: '2.0.0-beta.0+pr.114.a1b2c3d',
        gitSha: 'a1b2c3d',
      }),
    ).toBe('2.0.0-beta.0+pr.114.a1b2c3d');
  });

  it('omits the sha when it is unknown or absent', () => {
    expect(formatAppVersion({ name: 'soba-ui', version: '2.0.0-beta.1', gitSha: 'unknown' })).toBe(
      '2.0.0-beta.1',
    );
    expect(formatAppVersion({ name: 'soba-ui', version: '2.0.0-beta.1' })).toBe('2.0.0-beta.1');
  });
});
