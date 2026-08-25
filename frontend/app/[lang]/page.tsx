import LandingPage from '../ui/LandingPage';
import { PageLayout } from '@/src/components/PageLayout';
import { getDictionary, resolveLocale } from './dictionaries';

type PageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);
  return {
    title: `${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);

  return (
    <PageLayout
      headingId="landing-heading"
      heading={`${dict.general.welcomeTo} ${dict.general.titleAsService}`}
    >
      <LandingPage />
    </PageLayout>
  );
}
