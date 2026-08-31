import { getDictionary, resolveLocale } from '../../../dictionaries';
import FeatureScopePanel from '@/src/features/admin/ui/FeatureScopePanel';
import { loadFeaturesMeta } from '@/src/shared/config/featuresMeta';
import { getAdminFeatureMeta } from '@/src/features/admin/featureMeta';

type PageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);
  return {
    title: `${dict.admin.featureScopes.createHeading} | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page() {
  const { scopedFeatureCodes } = getAdminFeatureMeta(await loadFeaturesMeta());

  return (
    <section aria-labelledby="feature-scope-form-heading">
      <FeatureScopePanel scopedFeatureCodes={scopedFeatureCodes} />
    </section>
  );
}
