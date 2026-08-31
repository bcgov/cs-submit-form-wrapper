import { getDictionary, resolveLocale } from '../../../dictionaries';
import FeatureScopePanel from '@/src/features/admin/ui/FeatureScopePanel';
import { loadFeaturesMeta } from '@/src/shared/config/featuresMeta';
import { getAdminFeatureMeta } from '@/src/features/admin/featureMeta';

type PageProps = {
  params: Promise<{ lang: string; featureScopeId: string }>;
};

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
    loadFeaturesMeta().then((featuresMeta) => getAdminFeatureMeta(featuresMeta).scopedFeatureCodes),
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
