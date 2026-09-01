import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatAppVersion,
  getFormsAppBaseUrl,
  isRuntimeConfigPayload,
} from '@/src/shared/config/runtimeConfig';

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

describe('getFormsAppBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.__SOBA_FORMS_APP_URL;
  });

  it('falls back to this origin when nothing is configured', () => {
    // One deployment serving both modes: the forms app is this app.
    expect(getFormsAppBaseUrl()).toBe(window.location.origin);
  });

  it('prefers the injected value over the build-time env', () => {
    vi.stubEnv('NEXT_PUBLIC_SOBA_FORMS_APP_URL', 'https://built-in.example.ca');
    window.__SOBA_FORMS_APP_URL = 'https://injected.example.ca';
    expect(getFormsAppBaseUrl()).toBe('https://injected.example.ca');
  });

  it('uses the build-time env when nothing was injected', () => {
    vi.stubEnv('NEXT_PUBLIC_SOBA_FORMS_APP_URL', 'https://built-in.example.ca');
    expect(getFormsAppBaseUrl()).toBe('https://built-in.example.ca');
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
