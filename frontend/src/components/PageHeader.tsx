'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { TagGroup, TagList } from '@bcgov/design-system-react-components';
import { useDictionary } from '@/app/[lang]/Providers';
import styles from './PageLayout.module.css';

export type PageHeading = {
  heading?: string;
  /** Context label shown as a tag above the heading, typically the owning workspace. */
  eyebrow?: string;
};

type RegisterHeading = (value: PageHeading | null) => void;

const PageHeadingContext = createContext<RegisterHeading | null>(null);

type PageHeaderProviderProps = PageHeading & {
  headingId: string;
  description?: ReactNode;
  children: ReactNode;
};

export function PageHeaderProvider({
  headingId,
  heading,
  eyebrow,
  description,
  children,
}: Readonly<PageHeaderProviderProps>) {
  const dict = useDictionary();
  const [override, setOverride] = useState<PageHeading | null>(null);
  const register = useCallback<RegisterHeading>((value) => setOverride(value), []);

  const active = override ?? { heading, eyebrow };

  return (
    <PageHeadingContext.Provider value={register}>
      {active.heading ? (
        <>
          <div className={styles.eyebrow}>
            {active.eyebrow ? (
              <TagGroup aria-label={dict.workspaces?.workspace || 'Workspace'}>
                <TagList
                  items={[{ color: 'yellow', id: 'page-eyebrow', textValue: active.eyebrow }]}
                />
              </TagGroup>
            ) : null}
          </div>
          <h1 id={headingId} className={styles.heading}>
            {active.heading}
          </h1>
        </>
      ) : null}
      {description ? <p className={styles.description}>{description}</p> : null}
      {children}
    </PageHeadingContext.Provider>
  );
}

/**
 * Hand the layout a heading resolved on the client. The page's own `heading` renders until this
 * runs, so pass one that is right on the server. Last caller wins; unmounting restores the page's.
 */
export function usePageHeading({ heading, eyebrow }: PageHeading) {
  const register = useContext(PageHeadingContext);

  useEffect(() => {
    if (!register) return;
    register({ heading, eyebrow });
    return () => register(null);
  }, [register, heading, eyebrow]);
}
