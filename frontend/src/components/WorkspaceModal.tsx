import WorkspaceForm from '@/src/features/workspaces/ui/WorkspaceForm';
import { Modal as BSModal } from 'react-bootstrap';
import { Modal } from '@bcgov/design-system-react-components';
import { useDictionary } from '../../app/[lang]/Providers';

type WorkspaceModalProps = {
  readonly canCreateWorkspace: boolean;
};

export function WorkspaceModal({ canCreateWorkspace }: WorkspaceModalProps) {
  const dict = useDictionary();

  return (
    <Modal isKeyboardDismissDisabled isOpen style={{ overflow: 'scroll' }}>
      <BSModal.Header closeButton className="mt-2 mx-3">
        <BSModal.Title>{dict.workspaces.modalTitle}</BSModal.Title>
      </BSModal.Header>
      <BSModal.Body className="mt-3 mx-3">
        {canCreateWorkspace && <WorkspaceForm first={true} />}
        {!canCreateWorkspace && <p>{dict.general.needWorkspace}</p>}
      </BSModal.Body>
    </Modal>
  );
}
