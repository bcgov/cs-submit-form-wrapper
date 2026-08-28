'use client';
import { useMemo, useState, useCallback } from 'react';
import { Link, Button } from '@bcgov/design-system-react-components';
import { useRouter, usePathname } from 'next/navigation';

import type { Dictionary } from '@/src/types/plugins';
import { DataTable, type Column } from '@/src/components/DataTable';
import { Modal } from '@/src/components/Modal';
import { useAppSelector, useAppDispatch } from '@/lib/store';
import { useFormatLongDate } from '@/src/shared/hooks/useFormatLongDate';
import type { SubmissionListItem } from '@/src/types/submissions';
import { Tag } from '@/src/components/Tag';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { deleteFormSubmissionThunk } from '@/lib/slices/formSlice';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import {
  capitalizeFirstLetter,
  convertSubmissionIdToConfirmationId,
} from '@/src/shared/util/stringUtils';

interface FormSubmissionTabProps {
  dict: Dictionary;
}

export default function FormSubmissionTab({ dict }: FormSubmissionTabProps) {
  const { submissions, loading } = useAppSelector((state) => state.form);
  const dispatch = useAppDispatch();
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const formatLongDate = useFormatLongDate();
  const { token } = useKeycloak();
  const pathname = usePathname();
  const locale = getLocaleFromPath(pathname);
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleteId, setDeleteId] = useState<string>('');

  const deletePress = useCallback((submissionId: string) => {
    setShowDeleteConfirm(true);
    setDeleteId(submissionId);
  }, []);

  const confirmDelete = useCallback(() => {
    setShowDeleteConfirm(false);
    dispatch(deleteFormSubmissionThunk({ token, submissionId: deleteId }));
  }, [token, deleteId, dispatch]);

  const columns: Column<SubmissionListItem>[] = useMemo(
    () => [
      {
        key: 'id',
        label: dict.submission?.confirmationId || 'Confirmation Id',
        render: (sub) => <>{convertSubmissionIdToConfirmationId(sub.id)}</>,
      },
      {
        key: 'versionNo',
        label: dict.general?.version || 'Version',
        render: (sub) => `v${sub.versionNo || '?'}`,
      },
      {
        key: 'createdBy',
        label: dict.submission?.submitter || 'Submitter',
        render: (sub) => sub.createdBy || 'Anonymous',
      },
      {
        key: 'workflowState',
        label: dict.form?.status || 'Status',
        render: (sub) => (
          <Tag
            text={capitalizeFirstLetter(sub.workflowState)}
            color={sub.workflowState === 'submitted' ? 'green' : 'grey'}
          />
        ),
      },
      {
        key: 'submittedAt',
        label: dict.submission?.submittedAt || 'Submission Date',
        render: (sub) => (
          <span className="small">{sub.submittedAt ? formatLongDate(sub.submittedAt) : 'N/A'}</span>
        ),
      },
      {
        key: 'actions',
        label: dict.submission?.actions || 'Actions',
        render: (sub) => (
          <>
            <Link
              className="bcds-react-aria-Link medium false me-2"
              onPress={() => router.push(`/${locale}/submission/${sub.id}`)}
            >
              View
            </Link>
            <Link
              className="bcds-react-aria-Link medium false danger"
              onPress={() => {
                deletePress(sub.id);
              }}
            >
              Delete
            </Link>
          </>
        ),
      },
    ],
    [dict, formatLongDate, deletePress, locale, router],
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  return (
    <>
      <DataTable<SubmissionListItem>
        data={submissions}
        columns={columns}
        loading={loading}
        error=""
        emptyMessage="No submissions found."
        loadingMessage={dict.general.loading}
        itemName="submissions"
        caption="Submissions"
        pageSize={pageSize}
        currentPage={currentPage}
        totalItems={submissions.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
        pageSizeOptions={[5, 10, 25, 50]}
        keyExtractor={(sub) => sub.id}
      />
      <Modal
        show={showDeleteConfirm}
        title={`${dict.submission.deleteConfirm || 'Confirm Delete'}`}
        onClose={() => setShowDeleteConfirm(false)}
        size="sm"
      >
        <p className="text-center px-2 py-3 text-muted">
          {dict.submission.deleteConfirmText}: {deleteId}
        </p>
        <div>
          <Button
            variant="secondary"
            className="bcds-react-aria-Button medium secondary me-2"
            onPress={() => {
              setShowDeleteConfirm(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="secondary"
            danger
            onPress={() => {
              confirmDelete();
            }}
          >
            Confirm
          </Button>
        </div>
      </Modal>
    </>
  );
}
