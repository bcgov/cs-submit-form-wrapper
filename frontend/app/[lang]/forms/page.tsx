import { getDictionary, resolveLocale } from '../dictionaries';
import FormList from '@/src/features/designer/ui/FormList';
import { PageLayout } from '@/src/components/PageLayout';
import { loadFeaturesMeta } from '@/src/shared/config/featuresMeta';
import { createIsFeatureAllowed, FEATURE_CODES } from '@/src/shared/featureFlags/flags';

type PageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);
  return {
    title: `${dict.formioV5.formList.tableHeading} | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page({ params }: Readonly<PageProps>) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);
  const featuresMeta = await loadFeaturesMeta();
  const isFeatureAllowed = createIsFeatureAllowed(featuresMeta);

  return (
    <PageLayout headingId="forms-heading" heading={dict.general.forms}>
      <FormList
        designModeEnabled={isFeatureAllowed(FEATURE_CODES.DESIGN_MODE)}
        submitModeEnabled={isFeatureAllowed(FEATURE_CODES.SUBMIT_MODE)}
      />
    </PageLayout>
  );
}
