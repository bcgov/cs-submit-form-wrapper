'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './AppShell.module.css';

/** The side nav column. */
export function AppAside({ children }: Readonly<{ children: ReactNode }>) {
  const asideRef = useRef<HTMLElement>(null);

  // The header indents its branding by this width. It is content-driven, so it changes with locale
  // and with the collapsed state; measure rather than assume.
  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;
    const publishWidth = () => {
      document.documentElement.style.setProperty(
        '--app-nav-width',
        `${aside.getBoundingClientRect().width}px`,
      );
    };
    publishWidth();
    const observer = new ResizeObserver(publishWidth);
    observer.observe(aside);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--app-nav-width');
    };
  }, []);

  return (
    <aside ref={asideRef} className={`p-2 d-flex flex-column flex-shrink-0 ${styles.aside}`}>
      {children}
    </aside>
  );
}
