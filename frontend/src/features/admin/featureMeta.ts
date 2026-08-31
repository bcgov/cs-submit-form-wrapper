import type { FeaturesMetaPayload } from '@/src/shared/config/featuresMeta';
import { FEATURE_AVAILABILITY, FEATURE_CODES } from '@/src/shared/featureFlags/flags';

function isPlatformEnabled(meta: FeaturesMetaPayload, code: string): boolean {
  return meta.features.some((feature) => feature.code === code && feature.platformAllowed);
}

export function getAdminFeatureMeta(meta: FeaturesMetaPayload): {
  documentGenerationEnabled: boolean;
  scopedFeatureCodes: string[];
} {
  const documentGenerationEnabled = isPlatformEnabled(meta, FEATURE_CODES.DOCUMENT_GENERATION);
  const scopedFeatureCodes = meta.features
    .filter(
      (feature) =>
        feature.platformAllowed &&
        feature.availability === FEATURE_AVAILABILITY.SCOPED &&
        (documentGenerationEnabled || !feature.code.startsWith('document-generation')),
    )
    .map((feature) => feature.code)
    .sort((a, b) => a.localeCompare(b));

  return { documentGenerationEnabled, scopedFeatureCodes };
}
