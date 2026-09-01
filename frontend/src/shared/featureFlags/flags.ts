import type { FeaturesMetaPayload } from '@/src/shared/config/featuresMeta';

/** Feature `code` values aligned with `GET /meta/features` and `soba.feature`. */
export const FEATURE_CODES = {
  WORKSPACES: 'workspaces',
  DESIGN_MODE: 'design-mode',
  SUBMIT_MODE: 'submit-mode',
  /** Backend `soba.feature` seed code `meta` (API meta & health). Mirrored here so
   * the frontend feature enumeration stays in sync even without a dedicated UI. */
  META: 'meta',
  MARKETING: 'marketing',
  /** Umbrella feature for document generation surfaces and administration. */
  DOCUMENT_GENERATION: 'document-generation',
  /** BC File Upload component + CHEFS storage provider (backend `soba.feature` code `files`). */
  FILES: 'files',
} as const;

export type FeatureCode = (typeof FEATURE_CODES)[keyof typeof FEATURE_CODES];

/** Feature availability class, aligned with `soba.feature.availability`. */
export const FEATURE_AVAILABILITY = {
  FIXED: 'fixed',
  SCOPED: 'scoped',
} as const;

const FRONTEND_FEATURES_ENV = 'NEXT_PUBLIC_SOBA_FEATURES_ALLOWED';

/**
 * Raw allowlist string: runtime injection from root layout in the browser (Docker/compose),
 * else `process.env` (build-time for client bundles, runtime on server).
 */
function getFrontendFeaturesAllowlistRaw(): string | undefined {
  if (typeof window !== 'undefined' && typeof window.__SOBA_FEATURES_ALLOWED === 'string') {
    const raw = window.__SOBA_FEATURES_ALLOWED;
    return raw.trim() === '' ? undefined : raw;
  }
  const fromEnv = process.env[FRONTEND_FEATURES_ENV];
  return fromEnv === undefined || fromEnv.trim() === '' ? undefined : fromEnv;
}

/** Wildcard: allow every platform-allowed feature on this frontend deployment. */
const FRONTEND_FEATURES_WILDCARD_TOKENS = new Set(['*', 'all']);

export type FrontendFeaturesPolicy = 'all' | Set<string>;

export function normalizeFeatureCode(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Parses `NEXT_PUBLIC_SOBA_FEATURES_ALLOWED`.
 *
 * - **Unset or empty** — no codes allowed at the frontend layer (use `*` or `all` explicitly for “everything”).
 * - **`*` or `all`** (sole token, case-insensitive) — allow all platform-allowed features.
 * - **Comma-separated codes** — allow only those codes (must match `/meta/features` `code` values).
 */
export function parseFrontendFeaturesAllowlist(raw: string | undefined): FrontendFeaturesPolicy {
  if (raw === undefined || raw.trim() === '') {
    return new Set();
  }
  const tokens = raw.split(',').map(normalizeFeatureCode).filter(Boolean);
  if (tokens.length === 0) {
    return new Set();
  }
  if (tokens.length === 1 && FRONTEND_FEATURES_WILDCARD_TOKENS.has(tokens[0]!)) {
    return 'all';
  }
  return new Set(tokens);
}

/**
 * `featureAllowed(code) === platformAllowed(code) && frontendAllowed(code)`, for `fixed` features.
 * A `scoped` feature depends on a workspace/form grant the client can't see, so it always resolves
 * false here — callers must use `fetchFeatureAvailability` with the scope instead.
 * Unknown codes are not platform-allowed (missing from meta → false).
 */
export function createIsFeatureAllowed(meta: FeaturesMetaPayload) {
  const platformByCode = new Map(
    meta.features.map((f) => [normalizeFeatureCode(f.code), f.platformAllowed] as const),
  );
  // Normalize the availability value too, so a casing/whitespace variant can't fail open a scoped feature.
  const availabilityByCode = new Map(
    meta.features.map(
      (f) =>
        [
          normalizeFeatureCode(f.code),
          String(f.availability ?? FEATURE_AVAILABILITY.FIXED)
            .trim()
            .toLowerCase(),
        ] as const,
    ),
  );
  const policy = parseFrontendFeaturesAllowlist(getFrontendFeaturesAllowlistRaw());

  return function isFeatureAllowed(code: string): boolean {
    const key = normalizeFeatureCode(code);
    if (availabilityByCode.get(key) === FEATURE_AVAILABILITY.SCOPED) return false;
    const platformAllowed = platformByCode.get(key) ?? false;
    const frontendAllowed = policy === 'all' || policy.has(key);
    return platformAllowed && frontendAllowed;
  };
}

/** Known `FEATURE_CODES` that are both platform- and frontend-allowed for this build. */
export function listEnabledKnownFeatures(meta: FeaturesMetaPayload): FeatureCode[] {
  const isFeatureAllowed = createIsFeatureAllowed(meta);
  return (Object.values(FEATURE_CODES) as FeatureCode[]).filter((code) => isFeatureAllowed(code));
}
