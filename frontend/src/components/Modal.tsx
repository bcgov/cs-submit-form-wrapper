'use client';

import React from 'react';
import { Modal as BCModal, Dialog, Heading, ButtonGroup } from '@bcgov/design-system-react-components';
import { useDictionary } from '@/app/[lang]/Providers';
import styles from './Modal.module.css';

export interface ModalProps {
  show: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'lg' | 'xl';
  footer?: React.ReactNode;
}

// The design-system Modal is a fixed ~600px by default; map our legacy `size`
// prop onto an explicit width so existing callers keep their intended sizing.
const WIDTH_BY_SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: '24rem',
  lg: '50rem',
  xl: '71rem',
};

/**
 * App modal wrapper, now backed by the BC Design System `Modal`/`Dialog`.
 *
 * The public API (`show`/`title`/`onClose`/`size`/`footer`) is unchanged, so
 * callers are untouched. Overflow/scrolling and the close button (X) are
 * handled by the design-system components; the legacy `scrollable` prop was a
 * no-op everywhere it was used and has been dropped.
 */
export function Modal({ show, title, onClose, children, size = 'lg', footer }: ModalProps) {
  const dict = useDictionary();
  return (
    <BCModal
      isOpen={show}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable
      data-testid={`${title}-modal`}
      style={{ width: WIDTH_BY_SIZE[size], maxWidth: '100vw' }}
    >
      <Dialog isCloseable aria-label={title}>
        <div className={styles.header}>
          <Heading slot="title" className={styles.title}>
            {title}
          </Heading>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && (
          <div className={styles.footer}>
            <ButtonGroup ariaLabel={dict.modal.dialogActions}>{footer}</ButtonGroup>
          </div>
        )}
      </Dialog>
    </BCModal>
  );
}
