import { getDictionary, hasLocale, Locale } from '../../dictionaries';
import FormDesignerLoader from '@/src/features/designer/ui/FormDesignerLoader';
import { PageLayout } from '@/src/components/PageLayout';
import { notFound } from 'next/navigation';
import { loadFeaturesMeta } from '@/src/shared/config/featuresMeta';
import { createIsFeatureAllowed, FEATURE_CODES } from '@/src/shared/featureFlags/flags';

type PageProps = {
  params: Promise<{ lang: string; formId: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  if (!hasLocale(param.lang)) {
    param.lang = 'en';
  }
  const dict = await getDictionary(param.lang as Locale);
  return {
    title: `Form Designer | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page({ params }: PageProps) {
  const featuresMeta = await loadFeaturesMeta();
  const isFeatureAllowed = createIsFeatureAllowed(featuresMeta);
  if (!isFeatureAllowed(FEATURE_CODES.DESIGN_MODE)) {
    notFound();
  }

  const { lang, formId } = await params;
  const dict = await getDictionary((hasLocale(lang) ? lang : 'en') as Locale);

  return (
    <PageLayout
      headingId="designer-heading"
      heading={dict.general.formDesigner}
      headingHidden
      width="wide"
    >
      <FormDesignerLoader formId={formId} />
    </PageLayout>
  );
}
