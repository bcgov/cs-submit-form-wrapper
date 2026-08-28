'use client';

import { useState } from 'react';
import WorkspaceForm from '@/src/features/workspaces/ui/WorkspaceForm';
import { Modal } from '@/src/components/Modal';
import { useDictionary } from '../../app/[lang]/Providers';
import { readSessionValue, writeSessionValue } from '@/src/shared/storage/sessionStore';

type WorkspaceModalProps = {
  readonly canCreateWorkspace: boolean;
};

export const WORKSPACE_MODAL_DISMISSED_KEY = 'soba.workspaceModalDismissed';

export function WorkspaceModal({ canCreateWorkspace }: WorkspaceModalProps) {
  const dict = useDictionary();
  // sessionStorage is not reactive, so the dismissal is component state that happens to persist.
  // Reading it from storage alone would leave the modal on screen after its close button.
  const [dismissed, setDismissed] = useState(
    () => readSessionValue<boolean>(WORKSPACE_MODAL_DISMISSED_KEY) === true,
  );

  const handleClose = () => {
    setDismissed(true);
    writeSessionValue(WORKSPACE_MODAL_DISMISSED_KEY, true);
  };

  return (
    <Modal
      show={!dismissed}
      title={dict.workspaces.modalTitle}
      size="md"
      isDismissable={false}
      onClose={handleClose}
    >
      {canCreateWorkspace ? <WorkspaceForm first={true} /> : <p>{dict.general.needWorkspace}</p>}
    </Modal>
  );
}
