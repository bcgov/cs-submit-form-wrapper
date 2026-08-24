import type { CSSProperties, ReactNode } from 'react';
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
  /** Omit when a client child owns the heading and registers it instead. */
  heading?: ReactNode;
  headingHidden?: boolean;
  eyebrow?: ReactNode;
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
  headingHidden = false,
  eyebrow,
  description,
  width = 'default',
  children,
}: Readonly<PageLayoutProps>) {
  // CSSProperties admits no custom properties.
  const style = { '--page-max-width': MAX_WIDTH[width] } as CSSProperties;
  // The row is reserved so titles line up across pages, which only means anything where a title
  // is actually shown.
  const showEyebrowRow = Boolean(eyebrow) || (Boolean(heading) && !headingHidden);

  return (
    <section className={styles.page} style={style} aria-labelledby={headingId}>
      {showEyebrowRow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
      {heading ? (
        <h1 id={headingId} className={headingHidden ? 'visually-hidden' : styles.heading}>
          {heading}
        </h1>
      ) : null}
      {description ? <p className={styles.description}>{description}</p> : null}
      {children}
    </section>
  );
}
