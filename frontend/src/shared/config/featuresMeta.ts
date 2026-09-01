import { cache } from 'react';
import { getBootstrapApiBaseUrl } from '@/src/shared/config/runtimeConfig';

export type MetaFeatureRow = {
  code: string;
  name: string;
  description: string | null;
  version: string | null;
  status: string;
  platformAllowed: boolean;
  /** 'fixed' | 'scoped'. Optional; absent is treated as non-scoped. */
  availability?: string;
};

export type FeaturesMetaPayload = {
  features: MetaFeatureRow[];
};

let cachedFeaturesMeta: FeaturesMetaPayload | null = null;
let featuresMetaPromise: Promise<FeaturesMetaPayload> | null = null;

export function isFeaturesMetaPayload(value: unknown): value is FeaturesMetaPayload {
  if (!value || typeof value !== 'object') return false;
  const parsed = value as { features?: unknown };
  if (!Array.isArray(parsed.features)) return false;
  return parsed.features.every((row) => {
    if (!row || typeof row !== 'object') return false;
    const r = row as Record<string, unknown>;
    return (
      typeof r.code === 'string' &&
      typeof r.name === 'string' &&
      (r.description === null || typeof r.description === 'string') &&
      (r.version === null || typeof r.version === 'string') &&
      typeof r.status === 'string' &&
      typeof r.platformAllowed === 'boolean' &&
      (r.availability === undefined || typeof r.availability === 'string')
    );
  });
}

function assertFeaturesMetaShape(value: unknown): asserts value is FeaturesMetaPayload {
  if (!isFeaturesMetaPayload(value)) {
    throw new Error('Features meta payload is invalid');
  }
}

/** Attempts and backoff are deliberately small: this runs during SSR and holds up the render. */
const FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 150;

/** A 4xx is an answer, not a blip. Only transport failures and 5xx are worth trying again. */
class RetryableFeaturesMetaError extends Error {}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchFeaturesMetaOnce(): Promise<FeaturesMetaPayload> {
  let response: Response;
  try {
    response = await fetch(`${getBootstrapApiBaseUrl()}/meta/features`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error) {
    // Transport failure: DNS not resolving yet, a pod rolling, a connection reset.
    throw new RetryableFeaturesMetaError(
      `Failed to reach features meta: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    const message = `Failed to load features meta: ${response.status}`;
    throw response.status >= 500
      ? new RetryableFeaturesMetaError(message)
      : new Error(message);
  }
  const payload = (await response.json()) as unknown;
  assertFeaturesMetaShape(payload);
  return payload;
}

/**
 * Every layout and page gates on this, so a failure takes the whole render down. Backend
 * unreachability is usually momentary, so retry briefly before surfacing it. A persistent outage
 * still throws and is caught by the root error boundary rather than degrading to "no features",
 * which would render as a misconfigured app instead of an unavailable one.
 */
async function fetchFeaturesMeta(): Promise<FeaturesMetaPayload> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetchFeaturesMetaOnce();
    } catch (error) {
      if (!(error instanceof RetryableFeaturesMetaError) || attempt >= FETCH_ATTEMPTS) {
        throw error;
      }
      await delay(RETRY_DELAY_MS * attempt);
    }
  }
}

// Server: memoised per render, so nested layouts and pages share one fetch and the next request
// sees current flags. A module-level cache here would last the pod's lifetime.
const loadFeaturesMetaForRequest = cache(fetchFeaturesMeta);

export async function loadFeaturesMeta(): Promise<FeaturesMetaPayload> {
  if (typeof window === 'undefined') return loadFeaturesMetaForRequest();

  // Browser: the module cache is page-scoped, so a reload picks up changes.
  if (cachedFeaturesMeta) return cachedFeaturesMeta;
  if (featuresMetaPromise) return featuresMetaPromise;

  featuresMetaPromise = fetchFeaturesMeta()
    .then((payload) => {
      cachedFeaturesMeta = payload;
      return payload;
    })
    .finally(() => {
      featuresMetaPromise = null;
    });

  return featuresMetaPromise;
}

export function getCachedFeaturesMeta(): FeaturesMetaPayload | null {
  return cachedFeaturesMeta;
}
