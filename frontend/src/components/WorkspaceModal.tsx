import WorkspaceForm from '@/src/features/workspaces/ui/WorkspaceForm';
import { Modal, Heading, Button } from '@bcgov/design-system-react-components';
import { useDictionary } from '../../app/[lang]/Providers';
import { setCanceledDefaultModal } from '@/lib/slices/workspaceSlice';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { FaTimes } from 'react-icons/fa';

type WorkspaceModalProps = {
  readonly canCreateWorkspace: boolean;
};

export function WorkspaceModal({ canCreateWorkspace }: WorkspaceModalProps) {
  const dispatch = useAppDispatch();
  const dict = useDictionary();
  const { canceledDefaultModal } = useAppSelector((state) => state.workspace);

  return (
    <Modal
      isKeyboardDismissDisabled={true}
      isOpen={!canceledDefaultModal}
      style={{ overflow: 'scroll' }}
      onOpenChange={(open) => dispatch(setCanceledDefaultModal(!open))}
    >
      <Heading className="mt-2 mx-3">
        <span>{dict.workspaces.modalTitle}</span>
        <Button
          variant="link"
          onClick={() => dispatch(setCanceledDefaultModal(true))}
          className="float-end border-0 bg-transparent"
        >
          <FaTimes />
        </Button>
      </Heading>
      <div className="mt-3 mx-3">
        {canCreateWorkspace && <WorkspaceForm />}
        {!canCreateWorkspace && <p>{dict.general.needWorkspace}</p>}
      </div>
    </Modal>
  );
}
