import { getDictionary, resolveLocale } from '../../dictionaries';
import AdminDashboard from '@/src/features/admin/ui/AdminDashboard';
import { loadFeaturesMeta } from '@/src/shared/config/featuresMeta';
import {
  createIsFeatureAllowed,
  FEATURE_AVAILABILITY,
  FEATURE_CODES,
} from '@/src/shared/featureFlags/flags';

type PageProps = {
  params: Promise<{ lang: string }>;
};

function getFeatureScopePageProps(featuresMeta: Awaited<ReturnType<typeof loadFeaturesMeta>>) {
  const isFeatureAllowed = createIsFeatureAllowed(featuresMeta);
  const documentGenerationEnabled = isFeatureAllowed(FEATURE_CODES.DOCUMENT_GENERATION);
  const scopedFeatureCodes = featuresMeta.features
    .filter(
      (feature) =>
        feature.availability === FEATURE_AVAILABILITY.SCOPED &&
        (documentGenerationEnabled || !feature.code.startsWith('document-generation')),
    )
    .map((feature) => feature.code)
    .sort((a, b) => a.localeCompare(b));

  return { documentGenerationEnabled, scopedFeatureCodes };
}

export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);
  return {
    title: `${dict.admin.featureScopes.heading} | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page() {
  const props = getFeatureScopePageProps(await loadFeaturesMeta());

  return (
    <section aria-labelledby="admin-heading">
      <AdminDashboard {...props} defaultActiveTab="featureScopes" />
    </section>
  );
}
