export type FrontendRuntimeConfig = {
  auth: {
    provider: 'keycloak';
    idpPluginDefaultCode: string;
    keycloak: {
      url: string;
      realm: string;
      clientId: string;
      pkceMethod: 'S256';
    };
  };
  api: {
    baseUrl: string;
  };
  app: {
    submitUrl: string;
  };
  build: {
    name: string;
    version: string;
    /** Absent on backends that predate the field; the footer degrades to a bare version. */
    gitSha?: string;
  };
};

const DEFAULT_SOBA_API_BASE_URL = 'http://localhost:4000/api/v1';

/**
 * API base URL used before runtime config is loaded (and for the initial
 * /meta/frontend-config fetch). In the browser we use window.__SOBA_API_BASE_URL
 * injected by the server from NEXT_PUBLIC_SOBA_API_BASE_URL so deployed apps
 * get the correct URL at runtime; local dev uses .env or the default.
 *
 * In Docker Compose, the browser must use host-exposed ports (NEXT_PUBLIC → localhost:4000).
 * Server Components run inside the frontend container and need SOBA_API_INTERNAL_URL
 * (e.g. http://backend:4000/api/v1) — localhost:4000 there is this container, not the API.
 */
export function getBootstrapApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.__SOBA_API_BASE_URL) {
    return window.__SOBA_API_BASE_URL;
  }
  if (typeof window === 'undefined' && process.env.SOBA_API_INTERNAL_URL) {
    return process.env.SOBA_API_INTERNAL_URL;
  }
  return process.env.NEXT_PUBLIC_SOBA_API_BASE_URL || DEFAULT_SOBA_API_BASE_URL;
}

// Browser-scoped: a page load starts empty. Not for Server Components, where this would last the
// pod's lifetime. See loadBuildMeta.
let cachedConfig: FrontendRuntimeConfig | null = null;
let configPromise: Promise<FrontendRuntimeConfig> | null = null;

export function isRuntimeConfigPayload(config: unknown): config is FrontendRuntimeConfig {
  if (!config || typeof config !== 'object') return false;
  const parsed = config as Partial<FrontendRuntimeConfig>;
  return !!(
    parsed.auth?.keycloak?.url &&
    parsed.auth.keycloak.realm &&
    parsed.auth.keycloak.clientId &&
    parsed.api?.baseUrl &&
    parsed.build?.name &&
    parsed.build.version
  );
}

function assertRuntimeConfigShape(config: unknown): asserts config is FrontendRuntimeConfig {
  if (!isRuntimeConfigPayload(config)) {
    throw new Error('Runtime config payload is invalid');
  }
}

export async function loadFrontendRuntimeConfig(): Promise<FrontendRuntimeConfig> {
  if (cachedConfig) return cachedConfig;
  if (configPromise) return configPromise;

  configPromise = fetch(`${getBootstrapApiBaseUrl()}/meta/frontend-config`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load runtime config: ${response.status}`);
      }
      const payload = (await response.json()) as unknown;
      assertRuntimeConfigShape(payload);
      cachedConfig = payload;
      return payload;
    })
    .finally(() => {
      configPromise = null;
    });

  return configPromise;
}

export function getSobaApiBaseUrl(): string {
  // api.baseUrl is the browser-facing route, so it is wrong on the server: in-cluster it is the
  // public ingress, and under Docker Compose it resolves to the frontend container itself.
  if (typeof window === 'undefined') return getBootstrapApiBaseUrl();
  return cachedConfig?.api.baseUrl ?? getBootstrapApiBaseUrl();
}

export function getSubmitAppBaseUrl(): string {
  if (typeof window === 'undefined') return cachedConfig?.app.submitUrl ?? '';
  return cachedConfig?.app.submitUrl ?? window.location.origin;
}

/**
 * Build info for server-side display, read fresh each render. Frontend and backend Deployments
 * roll independently, so anything memoised here would report the previous release until the pod
 * restarts. Null when the backend is unreachable or the shape is wrong.
 */
export async function loadBuildMeta(): Promise<FrontendRuntimeConfig['build'] | null> {
  try {
    const response = await fetch(`${getBootstrapApiBaseUrl()}/meta/build`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as Partial<FrontendRuntimeConfig['build']>;
    if (!payload?.name || !payload.version) return null;
    return { name: payload.name, version: payload.version, gitSha: payload.gitSha };
  } catch {
    return null;
  }
}

/**
 * Semver string for display: `2.0.0-beta.1+abc1234`. Versions that already carry build metadata
 * (PR deployments send `+pr.<number>.<sha>`) are left alone; semver allows only one `+`.
 */
export function formatAppVersion(build: FrontendRuntimeConfig['build']): string {
  if (build.version.includes('+')) return build.version;
  const sha = build.gitSha && build.gitSha !== 'unknown' ? build.gitSha : null;
  return sha ? `${build.version}+${sha}` : build.version;
}
