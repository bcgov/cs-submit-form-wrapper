import type { CSSProperties, ReactNode } from 'react';
import { PageHeaderProvider } from './PageHeader';
import styles from './PageLayout.module.css';

export type PageWidth = 'narrow' | 'default' | 'wide';

const MAX_WIDTH: Record<PageWidth, string> = {
  narrow: '45rem',
  default: '75rem',
  wide: '90rem',
};

type PageLayoutProps = {
  /** Referenced by aria-labelledby, so it must match the heading actually rendered on the page. */
  headingId: string;
  /** Rendered until a client child registers its own through usePageHeading. */
  heading?: string;
  eyebrow?: string;
  description?: ReactNode;
  width?: PageWidth;
  children: ReactNode;
};

/**
 * The page shell: owns padding, content width, and the heading block. Pages pass content, never
 * arrangement, so every page keeps the same rhythm.
 */
export function PageLayout({
  headingId,
  heading,
  eyebrow,
  description,
  width = 'default',
  children,
}: Readonly<PageLayoutProps>) {
  // CSSProperties admits no custom properties.
  const style = { '--page-max-width': MAX_WIDTH[width] } as CSSProperties;

  return (
    <section className={styles.page} style={style} aria-labelledby={headingId}>
      <PageHeaderProvider
        headingId={headingId}
        heading={heading}
        eyebrow={eyebrow}
        description={description}
      >
        {children}
      </PageHeaderProvider>
    </section>
  );
}
