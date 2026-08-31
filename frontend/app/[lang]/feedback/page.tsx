import { getDictionary, resolveLocale } from '../dictionaries';
import { PageLayout } from '@/src/components/PageLayout';
import { SecondaryText } from '@/src/components/SecondaryText';

type PageProps = {
  params: Promise<{ lang: string }>;
};
export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);
  return {
    title: `${dict.general.feedback} | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);

  return (
    <PageLayout headingId="feedback-heading" heading={dict.general.feedback} width="narrow">
      <SecondaryText elementType="p" size="medium" data-testid="feedback-coming-soon">
        {dict.general.comingSoon}
      </SecondaryText>
    </PageLayout>
  );
}
