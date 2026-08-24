import { getDictionary, resolveLocale } from '../dictionaries';
import { PageLayout } from '@/src/components/PageLayout';

type PageProps = {
  params: Promise<{ lang: string }>;
};
export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);
  return {
    title: `${dict.general.help} | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default async function Page({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);

  return (
    <PageLayout headingId="help-heading" heading={dict.general.help} width="narrow">
      <p className="text-muted" data-testid="help-coming-soon">
        {dict.general.comingSoon}
      </p>
    </PageLayout>
  );
}
