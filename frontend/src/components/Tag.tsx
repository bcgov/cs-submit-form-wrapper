import type { ReactNode } from 'react';
import styles from './Tag.module.css';

export type TagColor = 'yellow' | 'blue' | 'bcBlue' | 'grey' | 'green';

type TagProps = {
  children: ReactNode;
  color?: TagColor;
  shape?: 'rectangular' | 'circular';
  /**
   * Read out before the tag text. Set it where nothing else names the tag; leave it off inside a
   * table cell, where the column header already does.
   */
  label?: string;
  'data-testid'?: string;
};

/** Non-interactive label pill. */
export function Tag({
  children,
  color = 'grey',
  shape = 'rectangular',
  label,
  'data-testid': testId,
}: Readonly<TagProps>) {
  return (
    <span className={`${styles.tag} ${styles[shape]} ${styles[color]}`} data-testid={testId}>
      {label ? <span className="visually-hidden">{label}: </span> : null}
      {children}
    </span>
  );
}
