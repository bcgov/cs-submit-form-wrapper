'use client';

import WorkspaceForm from '@/src/features/workspaces/ui/WorkspaceForm';
import { Modal } from '@/src/components/Modal';
import { useDictionary } from '../../app/[lang]/Providers';
import { setCanceledDefaultModal } from '@/lib/slices/workspaceSlice';
import { useAppDispatch, useAppSelector } from '@/lib/store';

type WorkspaceModalProps = {
  readonly canCreateWorkspace: boolean;
};

export function WorkspaceModal({ canCreateWorkspace }: WorkspaceModalProps) {
  const dispatch = useAppDispatch();
  const dict = useDictionary();
  const { canceledDefaultModal } = useAppSelector((state) => state.workspace);

  return (
    <Modal
      show={!canceledDefaultModal}
      title={dict.workspaces.modalTitle}
      size="md"
      isDismissable={false}
      onClose={() => dispatch(setCanceledDefaultModal(true))}
    >
      {canCreateWorkspace ? <WorkspaceForm first={true} /> : <p>{dict.general.needWorkspace}</p>}
    </Modal>
  );
}
