'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { getSobaSubmissions } from '@/src/shared/api/sobaApiDesign';
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import { isSessionExpired } from '@/src/shared/api/sobaFetch';
import type { SubmissionListItem } from '@/src/types/submissions';
import { DataTable, Column } from '@/src/components/DataTable';
import { RowActionButton } from '@/src/components/RowActionButton';
import { WorkflowStateBadge } from './WorkflowStateBadge';

interface SubmissionListProps {
  formId?: string;
}

export function SubmissionList({ formId }: SubmissionListProps = {}) {
  const { authenticated, initializing } = useKeycloak();
  const dict = useDictionary();
  const router = useRouter();
  const pathname = usePathname();
  const locale = getLocaleFromPath(pathname);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const {
    data,
    isLoading,
    error: loadError,
  } = useAuthedSWR(
    // The endpoint requires a scope anchor and rejects an unscoped list, so without a form there is
    // no request to make. `formId` is the SOBA formId, routed from FormList.
    formId ? ['submissions', formId] : null,
    (token) => getSobaSubmissions(token, { formId: formId as string }),
  );

  // parseJson casts the body unchecked, so a malformed 200 can land a non-array here.
  const submissions: SubmissionListItem[] = useMemo(
    () => (Array.isArray(data?.items) ? data.items : []),
    [data],
  );

  const error = useMemo(() => {
    if (!loadError) return null;
    if (isSessionExpired(loadError)) return dict.general.sessionExpired;
    return loadError instanceof Error ? loadError.message : String(loadError);
  }, [loadError, dict.general.sessionExpired]);

  const paginatedSubmissions = useMemo(
    () => submissions.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [submissions, currentPage, pageSize],
  );

  const loading = initializing || isLoading;

  // Auth gate only — loading (including Keycloak init) is shown inside the table
  // body so the page heading stays visible throughout.
  if (!authenticated && !initializing) {
    return null;
  }

  // Define columns for DataTable
  const columns: Column<SubmissionListItem>[] = [
    {
      key: 'id',
      label: dict.submission?.columns?.id || 'Submission ID',
      render: (sub) => (
        <RowActionButton
          main
          data-testid={`submission-view-${sub.id}`}
          onPress={() => router.push(`/${locale}/submission/${sub.id}`)}
        >
          {sub.id}
        </RowActionButton>
      ),
    },
    {
      key: 'formName',
      label: dict.submission?.columns?.formName || dict.form?.nameLabel || 'Form Name',
      render: (sub) => (
        <span className="fw-semibold">
          {sub.formName || dict.form?.nameLabel || 'Untitled Form'}
        </span>
      ),
    },
    {
      key: 'formId',
      label: dict.submission?.columns?.formId || 'Form ID',
      render: (sub) => <span className="text-muted small font-monospace">{sub.formId}</span>,
    },
    {
      key: 'versionNo',
      label: dict.submission?.columns?.version || 'Version',
      render: (sub) => <span className="small">v{sub.versionNo || 1}</span>,
    },
    {
      key: 'workflowState',
      label: dict.submission?.columns?.status || 'Status',
      render: (sub) => <WorkflowStateBadge state={sub.workflowState} />,
    },
  ];

  return (
    <DataTable<SubmissionListItem>
      data={paginatedSubmissions}
      columns={columns}
      loading={loading}
      error={error}
      emptyMessage={dict.submission?.empty || 'No submissions found yet.'}
      loadingMessage={dict.submission?.loading || 'Loading submissions...'}
      keyExtractor={(sub) => sub.id}
      itemName={dict.submission?.submissions || 'submissions'}
      caption={dict.submission?.submissions || 'Submissions'}
      totalItems={submissions.length}
      pageSize={pageSize}
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setCurrentPage(1);
      }}
    />
  );
}
