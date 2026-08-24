'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Button,
  Heading,
  InlineAlert,
  TagGroup,
  TagList,
  Text,
} from '@bcgov/design-system-react-components';
import { useDictionary } from '@/app/[lang]/Providers';
import styles from './PageLayout.module.css';

export type PageHeading = {
  heading?: string;
  /** Context label shown as a tag above the heading, typically the owning workspace. */
  eyebrow?: string;
};

/**
 * A condition that holds while the page is still usable. A notice that stops the page working is
 * an early return, and one that explains a nearby control belongs next to that control.
 */
export type PageNotice = {
  id: string;
  variant: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  body: string;
  action?: { label: string; onPress: () => void };
};

type RegisterHeading = (value: PageHeading | null) => void;
type RegisterNotices = (value: PageNotice[]) => void;

const PageHeadingContext = createContext<RegisterHeading | null>(null);
const PageNoticesContext = createContext<RegisterNotices | null>(null);

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
  const [notices, setNotices] = useState<PageNotice[]>([]);
  const registerHeading = useCallback<RegisterHeading>((value) => setOverride(value), []);
  const registerNotices = useCallback<RegisterNotices>((value) => setNotices(value), []);

  const active = override ?? { heading, eyebrow };

  return (
    <PageHeadingContext.Provider value={registerHeading}>
      <PageNoticesContext.Provider value={registerNotices}>
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
            <Heading level={1} id={headingId} className={styles.heading} isUnstyled>
              {active.heading}
            </Heading>
          </>
        ) : null}
        {description ? (
          <Text elementType="p" color="secondary" className={styles.description}>
            {description}
          </Text>
        ) : null}
        {/* Always in the DOM and empty to start, so a notice added later is announced but the ones
            present on load are not. */}
        <div className={styles.notices} aria-live="polite">
          {notices.map((notice) => (
            <InlineAlert
              key={notice.id}
              variant={notice.variant}
              title={notice.title}
              description={notice.body}
              role={notice.variant === 'danger' ? 'alert' : undefined}
              data-testid={`page-notice-${notice.id}`}
              buttons={
                notice.action ? (
                  <Button size="small" variant="secondary" onPress={notice.action.onPress}>
                    {notice.action.label}
                  </Button>
                ) : undefined
              }
            />
          ))}
        </div>
        {children}
      </PageNoticesContext.Provider>
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

/**
 * Declare the page's notices as a flat list of conditions; falsy entries drop out. The layout owns
 * their position, spacing, test ids and announcement.
 */
export function usePageNotices(notices: Array<PageNotice | false | null | undefined>) {
  const register = useContext(PageNoticesContext);
  const resolved = notices.filter(Boolean) as PageNotice[];
  // The array and any action callback are new on every render, so the effect keys on the content
  // instead and reads the current value from the ref.
  const signature = JSON.stringify(
    resolved.map((n) => [n.id, n.variant, n.title ?? '', n.body, n.action?.label ?? '']),
  );
  const latest = useRef(resolved);

  useEffect(() => {
    latest.current = resolved;
  });

  // Registered actions delegate through this rather than closing over the callback, which would
  // otherwise keep the state it captured when the notice text last changed.
  const invoke = useCallback((id: string) => {
    latest.current.find((notice) => notice.id === id)?.action?.onPress();
  }, []);

  useEffect(() => {
    if (!register) return;
    register(
      latest.current.map((notice) =>
        notice.action
          ? { ...notice, action: { label: notice.action.label, onPress: () => invoke(notice.id) } }
          : notice,
      ),
    );
    return () => register([]);
  }, [register, invoke, signature]);
}
