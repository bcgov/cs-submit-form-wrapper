'use client';

import React, { useEffect, useMemo } from 'react';
import { Provider } from 'react-redux';
import { I18nProvider } from 'react-aria-components';
import makeStore from '@/lib/store';
import { getDictionary } from '@/app/[lang]/dictionaries';
import { NotificationToast } from '@/app/ui/base/NotificationToast';

type Dictionary = Awaited<ReturnType<typeof getDictionary>>;

const DictionaryContext = React.createContext<Dictionary | null>(null);

export default function AppProviders({
  dictionary,
  locale,
  children,
}: {
  dictionary: Dictionary;
  locale: string;
  children: React.ReactNode;
}) {
  const store = useMemo(() => makeStore(), []);

  // The root layout renders a static `<html lang="en">` (it sits above the
  // `[lang]` segment and can't know the locale). Keep the document language in
  // sync with the active locale so assistive tech announces `/fr` pages in French.
  useEffect(() => {
    if (locale) {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return (
    <I18nProvider locale={locale}>
      <DictionaryContext.Provider value={dictionary}>
        <Provider store={store}>
          {children}
          <NotificationToast />
        </Provider>
      </DictionaryContext.Provider>
    </I18nProvider>
  );
}

export function useDictionary() {
  const dictionary = React.useContext(DictionaryContext);
  if (dictionary === null) {
    throw new Error('useDictionary hook must be used within AppProviders');
  }
  return dictionary;
}
