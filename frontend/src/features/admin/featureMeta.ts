import type { FeaturesMetaPayload } from '@/src/shared/config/featuresMeta';
import { FEATURE_AVAILABILITY, FEATURE_CODES } from '@/src/shared/featureFlags/flags';

function isPlatformEnabled(meta: FeaturesMetaPayload, code: string): boolean {
  return meta.features.some((feature) => feature.code === code && feature.platformAllowed);
}

/**
 * A backend engine is named `<umbrella>-<variant>` (document-generation-v3 under
 * document-generation), and the umbrella gates the surface the engine serves. Granting a variant
 * whose umbrella is off would have no effect, so those are not offered.
 */
function isUnderDisabledUmbrella(code: string, disabledUmbrellas: string[]): boolean {
  return disabledUmbrellas.some((umbrella) => code.startsWith(`${umbrella}-`));
}

export function getAdminFeatureMeta(meta: FeaturesMetaPayload): {
  documentGenerationEnabled: boolean;
  scopedFeatureCodes: string[];
} {
  const documentGenerationEnabled = isPlatformEnabled(meta, FEATURE_CODES.DOCUMENT_GENERATION);
  const disabledUmbrellas = documentGenerationEnabled
    ? []
    : [FEATURE_CODES.DOCUMENT_GENERATION as string];

  const scopedFeatureCodes = meta.features
    .filter(
      (feature) =>
        feature.platformAllowed &&
        feature.availability === FEATURE_AVAILABILITY.SCOPED &&
        !isUnderDisabledUmbrella(feature.code, disabledUmbrellas),
    )
    .map((feature) => feature.code)
    .sort((a, b) => a.localeCompare(b));

  return { documentGenerationEnabled, scopedFeatureCodes };
}
