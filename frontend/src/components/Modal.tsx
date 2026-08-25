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
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  /** Off for a prompt that has to be answered rather than dismissed with Escape or a backdrop click. */
  isDismissable?: boolean;
}

// The design-system Modal is a fixed ~600px, so `size` maps onto an explicit width.
const WIDTH_BY_SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: '24rem',
  md: '37.5rem',
  lg: '50rem',
  xl: '71rem',
};

/**
 * App modal, backed by the BC Design System `Modal`/`Dialog`.
 *
 * The design system supplies the close button (X) but not overflow handling, so
 * the stylesheet caps the height and scrolls the body.
 */
export function Modal({
  show,
  title,
  onClose,
  children,
  size = 'lg',
  footer,
  isDismissable = true,
}: ModalProps) {
  const dict = useDictionary();
  return (
    <BCModal
      isOpen={show}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={!isDismissable}
      data-testid={`${title}-modal`}
      style={{ width: WIDTH_BY_SIZE[size], maxWidth: '100vw' }}
    >
      <Dialog isCloseable aria-label={title}>
        <div className={styles.shell}>
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
        </div>
      </Dialog>
    </BCModal>
  );
}
