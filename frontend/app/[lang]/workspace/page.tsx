import { getDictionary, resolveLocale } from '../dictionaries';
import WorkspaceFormLoader from '@/src/features/workspaces/ui/WorkspaceFormLoader';
import { PageLayout } from '@/src/components/PageLayout';

type PageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const param = await params;
  const locale = resolveLocale(param.lang);
  const dict = await getDictionary(locale);
  return {
    title: `${dict.workspaces.createHeading} | ${dict.general.title}`,
    description: dict.general.description,
  };
}

export default function Page() {
  return (
    <PageLayout headingId="workspace-form-heading">
      <WorkspaceFormLoader />
    </PageLayout>
  );
}
