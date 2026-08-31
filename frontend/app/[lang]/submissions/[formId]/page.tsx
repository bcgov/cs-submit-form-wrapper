import { SubmissionList } from '@/src/features/submit-mode/ui/SubmissionList';
import { PageLayout } from '@/src/components/PageLayout';
import { getDictionary, hasLocale, Locale } from '../../dictionaries';
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
    title: `Submissions | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page({ params }: PageProps) {
  const featuresMeta = await loadFeaturesMeta();
  const isFeatureAllowed = createIsFeatureAllowed(featuresMeta);
  if (!isFeatureAllowed(FEATURE_CODES.SUBMIT_MODE)) {
    notFound();
  }

  const param = await params;
  const dict = await getDictionary((hasLocale(param.lang) ? param.lang : 'en') as Locale);
  return (
    <PageLayout headingId="submissions-heading" heading={dict.submission.submissions}>
      <SubmissionList formId={param.formId} />
    </PageLayout>
  );
}
