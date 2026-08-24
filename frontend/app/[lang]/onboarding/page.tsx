import { getDictionary, resolveLocale } from '../dictionaries';
import OnboardingPage from '@/src/features/onboarding/ui/OnboardingPage';
import { PageLayout } from '@/src/components/PageLayout';

type PageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);
  return {
    title: `${dict.onboarding.heading} | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);

  return (
    <PageLayout headingId="onboarding-heading" heading={dict.onboarding.heading} width="narrow">
      <OnboardingPage />
    </PageLayout>
  );
}
