import { SubmissionView } from '@/src/features/submit-mode/ui/SubmissionView';
import { PageLayout } from '@/src/components/PageLayout';
import { getDictionary, hasLocale, Locale } from '../../dictionaries';
import { notFound } from 'next/navigation';
import { loadFeaturesMeta } from '@/src/shared/config/featuresMeta';
import { createIsFeatureAllowed, FEATURE_CODES } from '@/src/shared/featureFlags/flags';

type PageProps = {
  params: Promise<{ lang: string; submissionId: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  if (!hasLocale(param.lang)) {
    param.lang = 'en';
  }
  const dict = await getDictionary(param.lang as Locale);
  return {
    title: `${dict.submission.pageTitle} | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page({ params }: PageProps) {
  const featuresMeta = await loadFeaturesMeta();
  const isFeatureAllowed = createIsFeatureAllowed(featuresMeta);
  if (!isFeatureAllowed(FEATURE_CODES.SUBMIT_MODE)) {
    notFound();
  }

  const { lang, submissionId } = await params;
  const dict = await getDictionary((hasLocale(lang) ? lang : 'en') as Locale);
  return (
    <PageLayout headingId="submission-view-heading" heading={dict.submission.pageTitle}>
      <SubmissionView key={submissionId} />
    </PageLayout>
  );
}
