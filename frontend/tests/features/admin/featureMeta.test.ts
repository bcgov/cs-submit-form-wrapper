import { describe, expect, it, vi, afterEach } from 'vitest';
import type { FeaturesMetaPayload } from '@/src/shared/config/featuresMeta';
import { getAdminFeatureMeta } from '@/src/features/admin/featureMeta';

const meta: FeaturesMetaPayload = {
  features: [
    {
      code: 'document-generation',
      name: 'Document generation',
      description: null,
      version: null,
      status: 'enabled',
      availability: 'fixed',
      platformAllowed: true,
    },
    {
      code: 'document-generation-v3',
      name: 'Document generation (CDOGS v3)',
      description: null,
      version: null,
      status: 'enabled',
      availability: 'scoped',
      platformAllowed: true,
    },
    {
      code: 'other-scoped',
      name: 'Other scoped feature',
      description: null,
      version: null,
      status: 'enabled',
      availability: 'scoped',
      platformAllowed: true,
    },
    {
      code: 'disabled-scoped',
      name: 'Disabled scoped feature',
      description: null,
      version: null,
      status: 'disabled',
      availability: 'scoped',
      platformAllowed: false,
    },
  ],
};

describe('getAdminFeatureMeta', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses backend platformAllowed state instead of the frontend feature allowlist', () => {
    vi.stubEnv('NEXT_PUBLIC_SOBA_FEATURES_ALLOWED', 'workspaces,design-mode,submit-mode');

    expect(getAdminFeatureMeta(meta)).toEqual({
      documentGenerationEnabled: true,
      scopedFeatureCodes: ['document-generation-v3', 'other-scoped'],
    });
  });

  it('hides document-generation scoped features when the umbrella feature is disabled', () => {
    const disabledDocumentGenerationMeta: FeaturesMetaPayload = {
      features: meta.features.map((feature) =>
        feature.code === 'document-generation' ? { ...feature, platformAllowed: false } : feature,
      ),
    };

    expect(getAdminFeatureMeta(disabledDocumentGenerationMeta)).toEqual({
      documentGenerationEnabled: false,
      scopedFeatureCodes: ['other-scoped'],
    });
  });

  it('keeps a feature whose code only shares the umbrella prefix', () => {
    const lookalikeMeta: FeaturesMetaPayload = {
      features: [
        ...meta.features.map((feature) =>
          feature.code === 'document-generation' ? { ...feature, platformAllowed: false } : feature,
        ),
        {
          code: 'document-generations-report',
          name: 'Unrelated feature',
          description: null,
          version: null,
          status: 'enabled',
          availability: 'scoped',
          platformAllowed: true,
        },
      ],
    };

    expect(getAdminFeatureMeta(lookalikeMeta).scopedFeatureCodes).toEqual([
      'document-generations-report',
      'other-scoped',
    ]);
  });
});
