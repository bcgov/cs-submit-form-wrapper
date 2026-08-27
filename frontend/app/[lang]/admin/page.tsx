import { getDictionary, resolveLocale } from '../dictionaries';
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

export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);
  return {
    title: `${dict.admin.heading} | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page() {
  const featuresMeta = await loadFeaturesMeta();
  const isFeatureAllowed = createIsFeatureAllowed(featuresMeta);
  const documentGenerationEnabled = isFeatureAllowed(FEATURE_CODES.DOCUMENT_GENERATION);
  // Only `scoped` features can be granted per workspace/form; `fixed` ones are platform-wide.
  const scopedFeatureCodes = featuresMeta.features
    .filter(
      (feature) =>
        feature.availability === FEATURE_AVAILABILITY.SCOPED &&
        (documentGenerationEnabled || !feature.code.startsWith('document-generation')),
    )
    .map((feature) => feature.code)
    .sort((a, b) => a.localeCompare(b));

  return (
    <section aria-labelledby="admin-heading">
      <AdminDashboard
        scopedFeatureCodes={scopedFeatureCodes}
        documentGenerationEnabled={documentGenerationEnabled}
      />
    </section>
  );
}
