import { getDictionary, resolveLocale } from '../../../dictionaries';
import FeatureScopePanel from '@/src/features/admin/ui/FeatureScopePanel';
import { loadFeaturesMeta } from '@/src/shared/config/featuresMeta';
import {
  createIsFeatureAllowed,
  FEATURE_AVAILABILITY,
  FEATURE_CODES,
} from '@/src/shared/featureFlags/flags';

type PageProps = {
  params: Promise<{ lang: string; featureScopeId: string }>;
};

function getScopedFeatureCodes(featuresMeta: Awaited<ReturnType<typeof loadFeaturesMeta>>) {
  const isFeatureAllowed = createIsFeatureAllowed(featuresMeta);
  const documentGenerationEnabled = isFeatureAllowed(FEATURE_CODES.DOCUMENT_GENERATION);
  return featuresMeta.features
    .filter(
      (feature) =>
        feature.availability === FEATURE_AVAILABILITY.SCOPED &&
        (documentGenerationEnabled || !feature.code.startsWith('document-generation')),
    )
    .map((feature) => feature.code)
    .sort((a, b) => a.localeCompare(b));
}

export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);
  return {
    title: `${dict.admin.featureScopes.manageHeading} | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page({ params }: Readonly<PageProps>) {
  const [param, scopedFeatureCodes] = await Promise.all([
    params,
    loadFeaturesMeta().then(getScopedFeatureCodes),
  ]);

  return (
    <section aria-labelledby="feature-scope-form-heading">
      <FeatureScopePanel
        scopedFeatureCodes={scopedFeatureCodes}
        featureScopeId={param.featureScopeId}
      />
    </section>
  );
}
