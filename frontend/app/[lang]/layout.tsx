import DictionaryProvider from './Providers';
import { Locale } from './dictionaries';
import { getDictionary } from './dictionaries';
import { Header } from '../ui/Header';
import { Footer } from '../ui/Footer';
import { SideNav } from '../ui/SideNav';
import shellStyles from '../ui/AppShell.module.css';
import { loadFeaturesMeta } from '@/src/shared/config/featuresMeta';
import { createIsFeatureAllowed, FEATURE_CODES } from '@/src/shared/featureFlags/flags';
import { getHeaderNavigationItems, getOverlayNavigationItems } from '@/src/app/plugins/registry';
import { AppAccessGuard } from '@/src/app/routing/AppAccessGuard';
import React from 'react';

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dictionary = await getDictionary(lang as Locale);
  const locale =
    dictionary.locale === 'en' || dictionary.locale === 'fr' ? dictionary.locale : 'en';

  const featuresMeta = await loadFeaturesMeta();
  const isFeatureAllowed = createIsFeatureAllowed(featuresMeta);
  const headerNavItems = getHeaderNavigationItems(locale, dictionary, isFeatureAllowed);
  const overlayNavItems = getOverlayNavigationItems(locale, dictionary, isFeatureAllowed);

  const showAppLinks =
    isFeatureAllowed(FEATURE_CODES.SUBMIT_MODE) || isFeatureAllowed(FEATURE_CODES.DESIGN_MODE);
  const showHome = isFeatureAllowed(FEATURE_CODES.MARKETING);
  const showWorkspaces = isFeatureAllowed(FEATURE_CODES.WORKSPACES);

  return (
    <DictionaryProvider dictionary={dictionary} locale={locale}>
      <Header
        headerNavItems={headerNavItems}
        overlayNavItems={overlayNavItems}
        showWorkspaces={showWorkspaces}
      />
      <div className="d-flex w-100">
        <aside className={`p-2 d-flex flex-column flex-shrink-0 ${shellStyles.aside}`}>
          <SideNav showAppLinks={showAppLinks} showHome={showHome} showWorkspaces={showWorkspaces} />
        </aside>
        <main id="main-content" tabIndex={-1} className="flex-grow-1 p-5 overflow-auto">
          <AppAccessGuard locale={locale} workspacesEnabled={showWorkspaces}>
            {children}
          </AppAccessGuard>
        </main>
      </div>
      <Footer hideAcknowledgement={true} contact={React.createElement('span', null, '')} />
    </DictionaryProvider>
  );
}
