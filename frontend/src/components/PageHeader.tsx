'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Heading, InlineAlert } from '@bcgov/design-system-react-components';
import { useDictionary } from '@/app/[lang]/Providers';
import { Tag } from './Tag';
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

type Entry<T> = { token: string; value: T };
type Register<T> = (token: string, value: T | null) => void;

const PageHeadingContext = createContext<Register<PageHeading> | null>(null);
const PageNoticesContext = createContext<Register<PageNotice[]> | null>(null);

/** Replaces this token's entry, or drops it. Other registrants are left alone. */
const upsert = <T,>(entries: Entry<T>[], token: string, value: T | null): Entry<T>[] => {
  const rest = entries.filter((entry) => entry.token !== token);
  return value === null ? rest : [...rest, { token, value }];
};

type PageHeaderProviderProps = {
  headingId: string;
  heading: string;
  children: ReactNode;
};

export function PageHeaderProvider({
  headingId,
  heading,
  children,
}: Readonly<PageHeaderProviderProps>) {
  const dict = useDictionary();
  const [headings, setHeadings] = useState<Entry<PageHeading>[]>([]);
  const [noticeEntries, setNoticeEntries] = useState<Entry<PageNotice[]>[]>([]);

  const registerHeading = useCallback<Register<PageHeading>>(
    (token, value) => setHeadings((entries) => upsert(entries, token, value)),
    [],
  );
  const registerNotices = useCallback<Register<PageNotice[]>>(
    (token, value) => setNoticeEntries((entries) => upsert(entries, token, value)),
    [],
  );

  // Last registrant wins the heading; an entry that supplies only an eyebrow leaves the page's own
  // heading standing.
  const claimed = headings[headings.length - 1]?.value;
  const activeHeading = claimed?.heading ?? heading;
  const activeEyebrow = claimed?.eyebrow;
  const notices = noticeEntries.flatMap((entry) => entry.value);

  return (
    <PageHeadingContext.Provider value={registerHeading}>
      <PageNoticesContext.Provider value={registerNotices}>
        <div className={styles.eyebrow}>
          {activeEyebrow ? (
            <Tag
              text={activeEyebrow}
              color="yellow"
              label={dict.workspaces.workspace}
              data-testid="page-eyebrow"
            />
          ) : null}
        </div>
        <Heading level={1} id={headingId} className={styles.heading} isUnstyled>
          {activeHeading}
        </Heading>
        <div className={styles.notices}>
          {notices.map((notice) => (
            <InlineAlert
              key={notice.id}
              variant={notice.variant}
              // BCDS points the alert's aria-labelledby at an id it only emits alongside `title`,
              // so a notice without one has no accessible name.
              title={notice.title ?? notice.body}
              description={notice.title ? notice.body : undefined}
              role={notice.variant === 'danger' ? 'alert' : 'status'}
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
 * Hand the layout a heading resolved on the client. Omitting `heading` leaves the page's own in
 * place, so a caller can supply only an eyebrow, or nothing until its data arrives.
 */
export function usePageHeading({ heading, eyebrow }: PageHeading) {
  const register = useContext(PageHeadingContext);
  const token = useId();

  useEffect(() => {
    if (!register) return;
    register(token, { heading, eyebrow });
    return () => register(token, null);
  }, [register, token, heading, eyebrow]);
}

/**
 * Declare the page's notices as a flat list of conditions; falsy entries drop out. The layout owns
 * their position, spacing, test ids and announcement.
 */
export function usePageNotices(notices: Array<PageNotice | false | null | undefined>) {
  const register = useContext(PageNoticesContext);
  const token = useId();
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
      token,
      latest.current.map((notice) =>
        notice.action
          ? { ...notice, action: { label: notice.action.label, onPress: () => invoke(notice.id) } }
          : notice,
      ),
    );
    return () => register(token, null);
  }, [register, token, invoke, signature]);
}
