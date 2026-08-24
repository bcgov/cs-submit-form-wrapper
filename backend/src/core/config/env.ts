import dotenv from 'dotenv';

let loaded = false;

// Load process env once per process: base first, then local overrides.
export const loadEnv = () => {
  if (loaded) return;
  const quiet = process.env.NODE_ENV === 'test';
  dotenv.config({ path: '.env', quiet });
  dotenv.config({ path: '.env.local', override: true, quiet });
  loaded = true;
};

// Ensure env is initialized as soon as this module is imported.
loadEnv();

/** Pure parser: "true"/"false" (trimmed, case-insensitive) → boolean. Throws otherwise. */
export function parseBooleanEnvValue(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  throw new Error("Value must be 'true' or 'false'");
}

/** Pure parser: string → number. Throws if not a valid number. */
export function parseNumberEnvValue(value: string): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error('Value must be a number');
  }
  return parsed;
}

/** Pure parser: comma-separated string → trimmed non-empty strings. */
export function parseCsvValue(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Environment key/value source (e.g. process.env or a simulated object for tests). */
export type EnvSource = Record<string, string | undefined>;

function getRequiredEnvFrom(source: EnvSource, key: string): string {
  const value = source[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function getOptionalEnvFrom(source: EnvSource, key: string): string | undefined {
  const value = source[key];
  return value !== undefined && value !== '' ? value : undefined;
}

function getBooleanEnvFrom(source: EnvSource, key: string): boolean | undefined {
  const value = source[key];
  if (value === undefined || value === '') return undefined;
  return parseBooleanEnvValue(value);
}

function getNumberEnvFrom(source: EnvSource, key: string): number | undefined {
  const value = source[key];
  if (value === undefined || value === '') return undefined;
  return parseNumberEnvValue(value);
}

function getCsvEnvFrom(source: EnvSource, key: string): string[] | undefined {
  const raw = getOptionalEnvFrom(source, key);
  if (!raw) return undefined;
  return parseCsvValue(raw);
}

/**
 * Resolves the database URL from an env source.
 * 1. If DATABASE_URL is set and non-empty, return it.
 * 2. Else if all of DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME are set, build and return the URL.
 * 3. Else throw.
 */
export function resolveDatabaseUrl(source: EnvSource): string {
  const url = getOptionalEnvFrom(source, 'DATABASE_URL');
  if (url !== undefined && url !== '') return url;

  const host = getOptionalEnvFrom(source, 'DB_HOST');
  const port = getNumberEnvFrom(source, 'DB_PORT');
  const user = getOptionalEnvFrom(source, 'DB_USER');
  const password = getOptionalEnvFrom(source, 'DB_PASSWORD');
  const dbName = getOptionalEnvFrom(source, 'DB_NAME');

  if (
    host !== undefined &&
    host !== '' &&
    port !== undefined &&
    user !== undefined &&
    user !== '' &&
    password !== undefined &&
    password !== '' &&
    dbName !== undefined &&
    dbName !== ''
  ) {
    return `postgres://${user}:${encodeURIComponent(password)}@${host}:${port}/${dbName}`;
  }

  throw new Error(
    'DATABASE_URL or all of DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME are required',
  );
}

/**
 * Express `trust proxy` value for `source`. Hop count (e.g. 1 = one ingress), or false when none.
 * `true` is not returned — express-rate-limit rejects it (ERR_ERL_PERMISSIVE_TRUST_PROXY).
 */
export function resolveTrustProxySetting(source: EnvSource): number | boolean {
  const raw = getOptionalEnvFrom(source, 'TRUST_PROXY_HOPS');
  if (raw !== undefined && raw !== '') {
    const n = parseNumberEnvValue(raw);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error('TRUST_PROXY_HOPS must be a non-negative integer');
    }
    return n === 0 ? false : n;
  }
  return getOptionalEnvFrom(source, 'NODE_ENV') === 'development' ? false : 1;
}

/** Build an env reader that reads from the given source. Use in tests with a simulated .env object. */
export function createEnvReader(source: EnvSource) {
  return {
    loadEnv,
    getRequiredEnv: (key: string) => getRequiredEnvFrom(source, key),
    getOptionalEnv: (key: string) => getOptionalEnvFrom(source, key),
    getBooleanEnv: (key: string) => getBooleanEnvFrom(source, key),
    getNumberEnv: (key: string) => getNumberEnvFrom(source, key),
    getCsvEnv: (key: string) => getCsvEnvFrom(source, key),
    getDatabaseUrl: () => resolveDatabaseUrl(source),
    /**
     * express.json body limit for the API surfaces. Larger than the 100kb default so document
     * generation can carry a base64 template inline (reducible once templates are stored server-side).
     */
    getJsonBodyLimit: () => getOptionalEnvFrom(source, 'HTTP_JSON_BODY_LIMIT') ?? '10mb',
    getDbAdminDatabase: () => getOptionalEnvFrom(source, 'DB_ADMIN_DATABASE'),
    // Pipeline performance fix: Revert if needed.
    getDbConnectionTimeoutMs: () => getNumberEnvFrom(source, 'DB_CONNECTION_TIMEOUT_MS') ?? 10000,
    getDbQueryTimeoutMs: () => getNumberEnvFrom(source, 'DB_QUERY_TIMEOUT_MS') ?? 60000,
    getDbStatementTimeoutMs: () => getNumberEnvFrom(source, 'DB_STATEMENT_TIMEOUT_MS') ?? 60000,
    getDbLockTimeoutMs: () => getNumberEnvFrom(source, 'DB_LOCK_TIMEOUT_MS') ?? 10000,
    getDbMigrationReadyAttempts: () => getNumberEnvFrom(source, 'DB_MIGRATION_READY_ATTEMPTS') ?? 5,
    getDbMigrationReadySleepMs: () =>
      getNumberEnvFrom(source, 'DB_MIGRATION_READY_SLEEP_MS') ?? 5000,
    // Pipeline performance fix: Revert if needed.
    getSystemSobaUserEmail: () => getOptionalEnvFrom(source, 'SYSTEM_SOBA_USER_EMAIL'),
    getSystemSobaSubject: () => getOptionalEnvFrom(source, 'SOBA_SYSTEM_SUBJECT'),
    isDevelopment: () => getOptionalEnvFrom(source, 'NODE_ENV') === 'development',
    getPluginsPath: () =>
      getOptionalEnvFrom(source, 'PLUGINS_PATH') ??
      getOptionalEnvFrom(source, 'WORKSPACE_PLUGINS_PATH'),
    getCacheDefaultCode: () => getOptionalEnvFrom(source, 'CACHE_DEFAULT_CODE'),
    getMessageBusDefaultCode: () => getOptionalEnvFrom(source, 'MESSAGEBUS_DEFAULT_CODE'),
    getEventStreamDefaultCode: () => getOptionalEnvFrom(source, 'EVENTSTREAM_DEFAULT_CODE'),
    getTempStorageDefaultCode: () => getOptionalEnvFrom(source, 'TEMPSTORAGE_DEFAULT_CODE'),
    getVirusScanDefaultCode: () => getOptionalEnvFrom(source, 'VIRUSSCAN_DEFAULT_CODE'),
    getFormEngineDefaultCode: () => getOptionalEnvFrom(source, 'FORM_ENGINE_DEFAULT_CODE'),
    getDocumentGenerationDefaultCode: () =>
      getOptionalEnvFrom(source, 'DOCUMENT_GENERATION_DEFAULT_CODE'),
    /** Login provider new workspaces default their Form submitters audience to (must be a seeded identity_provider code). */
    getDefaultSubmitterProvider: () =>
      getOptionalEnvFrom(source, 'DEFAULT_SUBMITTER_PROVIDER') ?? 'azureidir',
    getStorageProfiles: () => {
      const raw = getOptionalEnvFrom(source, 'STORAGE_PROFILES');
      return raw ? parseCsvValue(raw) : [];
    },
    getRateLimitWindowMs: () => getNumberEnvFrom(source, 'RATE_LIMIT_WINDOW_MS'),
    getRateLimitMax: () => getNumberEnvFrom(source, 'RATE_LIMIT_MAX'),
    getRateLimitApiWindowMs: () => getNumberEnvFrom(source, 'RATE_LIMIT_API_WINDOW_MS'),
    getRateLimitApiMax: () => getNumberEnvFrom(source, 'RATE_LIMIT_API_MAX'),
    getRateLimitPublicWindowMs: () => getNumberEnvFrom(source, 'RATE_LIMIT_PUBLIC_WINDOW_MS'),
    getRateLimitPublicMax: () => getNumberEnvFrom(source, 'RATE_LIMIT_PUBLIC_MAX'),
    getTrustProxySetting: () => resolveTrustProxySetting(source),
    /** Production CORS allowlist (comma-separated trusted origins). */
    getCorsOrigins: () => getCsvEnvFrom(source, 'CORS_ORIGIN'),
    /** Development CORS fallback origins, used when CORS_ORIGIN is unset in development. */
    getCorsDevOrigins: () => getCsvEnvFrom(source, 'CORS_DEV_ORIGIN'),
    getTemporalAllowed: () => getBooleanEnvFrom(source, 'TEMPORAL_ALLOWED') ?? false,
    getTemporalAddress: () => getOptionalEnvFrom(source, 'TEMPORAL_ADDRESS') ?? 'localhost:7233',
    getTemporalNamespace: () => getOptionalEnvFrom(source, 'TEMPORAL_NAMESPACE') ?? 'default',
    getTemporalTaskQueue: () => getOptionalEnvFrom(source, 'TEMPORAL_TASK_QUEUE') ?? 'soba',
    getTemporalWorkerHealthPort: () =>
      getNumberEnvFrom(source, 'TEMPORAL_WORKER_HEALTH_PORT') ?? 9090,
  };
}

export type EnvReader = ReturnType<typeof createEnvReader>;

const getRequiredEnv = (key: string): string => getRequiredEnvFrom(process.env, key);
const getOptionalEnv = (key: string): string | undefined => getOptionalEnvFrom(process.env, key);
const getBooleanEnv = (key: string): boolean | undefined => getBooleanEnvFrom(process.env, key);
const getNumberEnv = (key: string): number | undefined => getNumberEnvFrom(process.env, key);
const getCsvEnv = (key: string): string[] | undefined => getCsvEnvFrom(process.env, key);

export const env = {
  loadEnv,
  getRequiredEnv,
  getOptionalEnv,
  getBooleanEnv,
  getNumberEnv,
  getCsvEnv,
  getDatabaseUrl: () => resolveDatabaseUrl(process.env),
  /**
   * express.json body limit for the API surfaces. Larger than the 100kb default so document
   * generation can carry a base64 template inline (reducible once templates are stored server-side).
   */
  getJsonBodyLimit: () => getOptionalEnv('HTTP_JSON_BODY_LIMIT') ?? '10mb',
  getDbAdminDatabase: () => getOptionalEnv('DB_ADMIN_DATABASE'),
  // Pipeline performance fix: Revert if needed.
  getDbConnectionTimeoutMs: () => getNumberEnv('DB_CONNECTION_TIMEOUT_MS') ?? 10000,
  getDbQueryTimeoutMs: () => getNumberEnv('DB_QUERY_TIMEOUT_MS') ?? 60000,
  getDbStatementTimeoutMs: () => getNumberEnv('DB_STATEMENT_TIMEOUT_MS') ?? 60000,
  getDbLockTimeoutMs: () => getNumberEnv('DB_LOCK_TIMEOUT_MS') ?? 10000,
  getDbMigrationReadyAttempts: () => getNumberEnv('DB_MIGRATION_READY_ATTEMPTS') ?? 5,
  getDbMigrationReadySleepMs: () => getNumberEnv('DB_MIGRATION_READY_SLEEP_MS') ?? 5000,
  // Pipeline performance fix: Revert if needed.
  getSystemSobaUserEmail: () => getOptionalEnv('SYSTEM_SOBA_USER_EMAIL'),
  /** Subject for the system SOBA user identity (provider=system). Default in code: soba-system. */
  getSystemSobaSubject: () => getOptionalEnv('SOBA_SYSTEM_SUBJECT'),
  isDevelopment: () => getOptionalEnv('NODE_ENV') === 'development',
  getPluginsPath: () => getOptionalEnv('PLUGINS_PATH') ?? getOptionalEnv('WORKSPACE_PLUGINS_PATH'),
  getCacheDefaultCode: () => getOptionalEnv('CACHE_DEFAULT_CODE'),
  getMessageBusDefaultCode: () => getOptionalEnv('MESSAGEBUS_DEFAULT_CODE'),
  getEventStreamDefaultCode: () => getOptionalEnv('EVENTSTREAM_DEFAULT_CODE'),
  getTempStorageDefaultCode: () => getOptionalEnv('TEMPSTORAGE_DEFAULT_CODE'),
  getVirusScanDefaultCode: () => getOptionalEnv('VIRUSSCAN_DEFAULT_CODE'),
  getFormEngineDefaultCode: () => getOptionalEnv('FORM_ENGINE_DEFAULT_CODE'),
  /** Document generation backend the consumer defaults to (a discovered plugin code). */
  getDocumentGenerationDefaultCode: () => getOptionalEnv('DOCUMENT_GENERATION_DEFAULT_CODE'),
  /** Login provider new workspaces default their Form submitters audience to (must be a seeded identity_provider code). */
  getDefaultSubmitterProvider: () => getOptionalEnv('DEFAULT_SUBMITTER_PROVIDER') ?? 'azureidir',
  getStorageProfiles: () => {
    const raw = getOptionalEnv('STORAGE_PROFILES');
    return raw ? parseCsvValue(raw) : [];
  },
  getRateLimitWindowMs: () => getNumberEnv('RATE_LIMIT_WINDOW_MS'),
  getRateLimitMax: () => getNumberEnv('RATE_LIMIT_MAX'),
  getRateLimitApiWindowMs: () => getNumberEnv('RATE_LIMIT_API_WINDOW_MS'),
  getRateLimitApiMax: () => getNumberEnv('RATE_LIMIT_API_MAX'),
  getRateLimitPublicWindowMs: () => getNumberEnv('RATE_LIMIT_PUBLIC_WINDOW_MS'),
  getRateLimitPublicMax: () => getNumberEnv('RATE_LIMIT_PUBLIC_MAX'),
  getTrustProxySetting: () => resolveTrustProxySetting(process.env),
  /** Production CORS allowlist (comma-separated trusted origins). */
  getCorsOrigins: () => getCsvEnv('CORS_ORIGIN'),
  /** Development CORS fallback origins, used when CORS_ORIGIN is unset in development. */
  getCorsDevOrigins: () => getCsvEnv('CORS_DEV_ORIGIN'),
  getTemporalAllowed: () => getBooleanEnv('TEMPORAL_ALLOWED') ?? false,
  getTemporalAddress: () => getOptionalEnv('TEMPORAL_ADDRESS') ?? 'localhost:7233',
  getTemporalNamespace: () => getOptionalEnv('TEMPORAL_NAMESPACE') ?? 'default',
  getTemporalTaskQueue: () => getOptionalEnv('TEMPORAL_TASK_QUEUE') ?? 'soba',
  getTemporalWorkerHealthPort: () => getNumberEnv('TEMPORAL_WORKER_HEALTH_PORT') ?? 9090,
  // Match the chart's haproxy.router.openshift.io/timeout annotation.
  getHttpRouteTimeoutMs: () => getNumberEnv('HTTP_ROUTE_TIMEOUT_MS'),
  // Budget for one outbound call. Unset derives it from the route timeout.
  getHttpOutboundTimeoutMs: () => getNumberEnv('HTTP_OUTBOUND_TIMEOUT_MS'),
  // Max upload size accepted by the files API. Feature-level (not per storage backend).
  getFilesMaxFileSizeMb: () => getNumberEnv('FILES_MAX_FILE_SIZE_MB') || 10,
  // Storage profile the files feature reads/writes. Defaults to 'default'.
  getFilesStorageProfile: () => getOptionalEnv('FILES_STORAGE_PROFILE') ?? 'default',
};
