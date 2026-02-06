import { FormList } from '../ui/FormList';
import { getDictionary, hasLocale, Locale } from './dictionaries';

export async function generateMetadata({params}: PageProps<'/[lang]'>) {
  const param = await params
  if (!hasLocale(param.lang)) {
    param.lang = 'en'
  }
  const dict = await getDictionary(param.lang as Locale) // ensure lang is valid
  return {
    title: `Form List | ${dict.general.title}`,
    description: dict.general.description,
  }
}

export default async function Page() {
  return (
    <>
      <div>
        <FormList />
      </div>
    </>
  );
}
