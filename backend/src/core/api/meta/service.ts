import packageJson from '../../../../package.json';
import { env } from '../../config/env';
import { authEnv } from '../../config/authEnv';
import { getFormEnginePlugins } from '../../integrations/form-engine/FormEngineRegistry';
import {
  getActivePluginCodes,
  getActiveStorageBackendCodes,
  getFeatureGatedPluginCodes,
  getPluginCatalog,
} from '../../integrations/plugins/PluginRegistry';
import { isFeatureEnabled, listFeatures } from '../../db/repos/featureRepo';
import { isFeatureAvailable } from '../../services/featureAvailabilityService';
import { roleService } from '../../services/roleService';

function parseKeycloakIssuer(issuer: string): { url: string; realm: string } {
  const marker = '/realms/';
  const markerIndex = issuer.indexOf(marker);
  if (markerIndex === -1) {
    return { url: issuer, realm: '' };
  }
  const url = issuer.slice(0, markerIndex);
  const remainder = issuer.slice(markerIndex + marker.length);
  const realm = remainder.split('/')[0] ?? '';
  return { url, realm };
}

// Deployments set APP_VERSION; package.json is the fallback for local runs. Release tags are
// conventionally `vX.Y.Z`, so drop the prefix rather than reporting "v2.1.0" as the version.
function resolveAppVersion(): string {
  const configured = env.getOptionalEnv('APP_VERSION');
  return configured ? configured.replace(/^v(?=\d)/, '') : packageJson.version;
}

function resolveGitSha(): string {
  return env.getOptionalEnv('GIT_SHA') ?? 'unknown';
}

export class MetaApiService {
  async getPlugins() {
    const plugins = getPluginCatalog();
    // Selectable adapter codes come from the registry; form engine has its own registry.
    const activeFormEngineCode =
      env.getFormEngineDefaultCode() ?? getFormEnginePlugins()[0]?.code ?? 'formio-v5';
    const activeCodes = new Set([
      activeFormEngineCode,
      ...getActivePluginCodes(),
      ...getActiveStorageBackendCodes(),
    ]);
    // Feature-gated plugins (e.g. document-generation backends) aren't selected by a single config
    // code — they're enabled when their gating feature is platform-enabled. Any plugin kind that
    // declares a featureCode is picked up here generically, so new families need no code change.
    const enabledFeatureCodes = new Set(
      (await listFeatures()).filter((f) => isFeatureEnabled(f.status)).map((f) => f.code),
    );
    for (const { code, featureCode } of getFeatureGatedPluginCodes()) {
      if (enabledFeatureCodes.has(featureCode)) activeCodes.add(code);
    }
    return {
      plugins: plugins.map((plugin) => ({
        ...plugin,
        enabled: activeCodes.has(plugin.code),
      })),
    };
  }

  async getFeatures() {
    const features = await listFeatures();
    return {
      features: features.map((f) => ({
        code: f.code,
        name: f.name,
        description: f.description,
        version: f.version,
        status: f.status,
        availability: f.availability,
        platformAllowed: isFeatureEnabled(f.status),
      })),
    };
  }

  /**
   * Resolve whether a feature is available for a workspace/form scope (3-gate resolution). Lets the
   * frontend check a `scoped` feature it cannot resolve locally, since grants live server-side.
   */
  async getFeatureAvailability(params: { code: string; workspaceId?: string; formId?: string }) {
    const available = await isFeatureAvailable(params.code, {
      workspaceId: params.workspaceId,
      formId: params.formId,
    });
    return { code: params.code, available };
  }

  getBuild() {
    return {
      name: packageJson.name,
      version: resolveAppVersion(),
      nodeVersion: process.version,
      gitSha: resolveGitSha(),
      gitTag: env.getOptionalEnv('GIT_TAG') ?? 'unknown',
      imageTag: env.getOptionalEnv('IMAGE_TAG') ?? 'unknown',
    };
  }

  getFrontendConfig() {
    const issuer = authEnv.getIdpPluginDefaultSsoJwtIssuer();
    const { url, realm } = parseKeycloakIssuer(issuer);
    const clientId = authEnv.getIdpPluginDefaultSsoJwtAudience() ?? '';
    return {
      auth: {
        provider: 'keycloak',
        idpPluginDefaultCode: authEnv.getIdpPluginDefaultCode(),
        keycloak: {
          url,
          realm,
          clientId,
          pkceMethod: 'S256',
        },
      },
      api: {
        baseUrl: env.getOptionalEnv('SOBA_API_BASE_URL') ?? 'http://localhost:4000/api/v1',
      },
      app: {
        submitUrl: env.getOptionalEnv('SUBMIT_APP_URL') ?? 'http://localhost:3000',
      },
      build: {
        name: packageJson.name,
        version: resolveAppVersion(),
        gitSha: resolveGitSha(),
      },
    };
  }

  async getFormEngines() {
    const plugins = getFormEnginePlugins();
    const defaultCode = env.getFormEngineDefaultCode();
    return {
      items: plugins.map((plugin) => ({
        code: plugin.code,
        name: plugin.name,
        engineVersion: plugin.version ?? null,
        isDefault: plugin.code === (defaultCode ?? plugins[0]?.code ?? null),
      })),
    };
  }

  async getRoles(filters?: {
    code?: string[];
    source?: string;
    status?: string;
    onlyEnabledFeatures?: boolean;
  }) {
    const roles = await roleService.listRoles(filters);
    return { roles };
  }
}

export const metaApiService = new MetaApiService();
