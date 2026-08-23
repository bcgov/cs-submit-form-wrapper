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

async function fetchFeaturesMeta(): Promise<FeaturesMetaPayload> {
  const response = await fetch(`${getBootstrapApiBaseUrl()}/meta/features`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to load features meta: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  assertFeaturesMetaShape(payload);
  return payload;
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
