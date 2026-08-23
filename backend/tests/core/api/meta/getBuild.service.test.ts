import packageJson from '../../../../package.json';
import { metaApiService } from '../../../../src/core/api/meta/service';

const ENV_KEYS = ['APP_VERSION', 'GIT_SHA', 'IDP_PLUGIN_DEFAULT_SSO_JWT_ISSUER'] as const;

describe('MetaApiService build version resolution', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    // getFrontendConfig needs an issuer to parse; the value itself is irrelevant here.
    process.env.IDP_PLUGIN_DEFAULT_SSO_JWT_ISSUER = 'https://example.test/realms/soba';
    delete process.env.APP_VERSION;
    delete process.env.GIT_SHA;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('prefers APP_VERSION over the package version', () => {
    process.env.APP_VERSION = '2.1.0-beta.4';

    expect(metaApiService.getBuild().version).toBe('2.1.0-beta.4');
    expect(metaApiService.getFrontendConfig().build.version).toBe('2.1.0-beta.4');
  });

  it('falls back to the package version when APP_VERSION is unset', () => {
    expect(metaApiService.getBuild().version).toBe(packageJson.version);
    expect(metaApiService.getFrontendConfig().build.version).toBe(packageJson.version);
  });

  it('treats an empty APP_VERSION as unset', () => {
    process.env.APP_VERSION = '';

    expect(metaApiService.getBuild().version).toBe(packageJson.version);
  });

  it('drops the v prefix a release tag carries', () => {
    process.env.APP_VERSION = 'v2.1.0';

    expect(metaApiService.getBuild().version).toBe('2.1.0');
  });

  it('keeps a leading v that is part of the version itself', () => {
    process.env.APP_VERSION = 'valpha';

    expect(metaApiService.getBuild().version).toBe('valpha');
  });

  it('reports the same version from both surfaces', () => {
    process.env.APP_VERSION = 'v3.0.0-rc.2';

    expect(metaApiService.getFrontendConfig().build.version).toBe(
      metaApiService.getBuild().version,
    );
  });

  it('reports the git sha on both build and frontend config', () => {
    process.env.GIT_SHA = 'abc1234';

    expect(metaApiService.getBuild().gitSha).toBe('abc1234');
    expect(metaApiService.getFrontendConfig().build.gitSha).toBe('abc1234');
  });

  it('reports an unknown git sha when GIT_SHA is unset', () => {
    expect(metaApiService.getBuild().gitSha).toBe('unknown');
    expect(metaApiService.getFrontendConfig().build.gitSha).toBe('unknown');
  });
});
