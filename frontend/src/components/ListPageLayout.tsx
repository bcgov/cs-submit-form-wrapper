'use client';

import type { ReactNode } from 'react';
import styles from './ListPageLayout.module.css';

type ListPageToolbarProps = {
  children: ReactNode;
  align?: 'between' | 'end';
};

export function ListPageToolbar({ children, align = 'between' }: Readonly<ListPageToolbarProps>) {
  return <div className={align === 'end' ? styles.toolbarEnd : styles.toolbar}>{children}</div>;
}

export function ListPageAuthGate({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={styles.authGate}>{children}</div>;
}
