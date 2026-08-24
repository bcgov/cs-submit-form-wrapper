import { PageLayout } from '@/src/components/PageLayout';
import StartSubmission from '@/src/features/submit-mode/ui/StartSubmission';
import { getDictionary, resolveLocale } from '../../dictionaries';
import { notFound } from 'next/navigation';
import { loadFeaturesMeta } from '@/src/shared/config/featuresMeta';
import { createIsFeatureAllowed, FEATURE_CODES } from '@/src/shared/featureFlags/flags';

type PageProps = {
  params: Promise<{ lang: string; formId: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);
  const t = dict.formioV5.formRender.pageTitle;
  return {
    title: `${t} | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page({ params }: PageProps) {
  const featuresMeta = await loadFeaturesMeta();
  const isFeatureAllowed = createIsFeatureAllowed(featuresMeta);
  if (!isFeatureAllowed(FEATURE_CODES.SUBMIT_MODE)) {
    notFound();
  }

  const { lang } = await params;
  const locale = resolveLocale(lang);
  const dict = await getDictionary(locale);
  return (
    <PageLayout
      headingId="formio-v5-render-heading"
      heading={dict.formioV5.formRender.pageTitle}
    >
      <StartSubmission />
    </PageLayout>
  );
}
