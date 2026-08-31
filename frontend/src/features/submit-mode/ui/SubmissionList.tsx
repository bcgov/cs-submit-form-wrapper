'use client';

import { useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { getSobaSubmissions } from '@/src/shared/api/sobaApiDesign';
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import { listReadConfig } from '@/src/shared/api/swrConfig';
import { isSessionExpired } from '@/src/shared/api/sobaFetch';
import { SUBMISSIONS_LIST_QUERY } from '@/src/shared/list/listQueryMemory';
import { PAGE_SIZE_OPTIONS, useListQuery } from '@/src/shared/list/useListQuery';
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
  const listQuery = useListQuery(SUBMISSIONS_LIST_QUERY);

  const {
    data,
    isLoading,
    error: loadError,
  } = useAuthedSWR(
    // The endpoint requires a scope anchor and rejects an unscoped list, so without a form there is
    // no request to make. `formId` is the SOBA formId, routed from FormList.
    formId
      ? ['submissions', formId, listQuery.offset, listQuery.pageSize, listQuery.sort, listQuery.q]
      : null,
    (token) =>
      getSobaSubmissions(token, {
        offset: listQuery.offset,
        limit: listQuery.pageSize,
        sort: listQuery.sort,
        q: listQuery.q,
        formId: formId as string,
      }),
    listReadConfig,
  );

  const submissions: SubmissionListItem[] = useMemo(
    () => (Array.isArray(data?.items) ? data.items : []),
    [data],
  );

  const error = useMemo(() => {
    if (!loadError) return null;
    if (isSessionExpired(loadError)) return dict.general.sessionExpired;
    return loadError instanceof Error ? loadError.message : String(loadError);
  }, [loadError, dict.general.sessionExpired]);

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
      data={submissions}
      columns={columns}
      loading={loading}
      error={error}
      emptyMessage={dict.submission?.empty || 'No submissions found yet.'}
      loadingMessage={dict.submission?.loading || 'Loading submissions...'}
      keyExtractor={(sub) => sub.id}
      itemName={dict.submission?.submissions || 'submissions'}
      caption={dict.submission?.submissions || 'Submissions'}
      totalItems={data?.page?.total}
      pageSize={listQuery.pageSize}
      currentPage={listQuery.page}
      onPageChange={listQuery.setPage}
      onPageSizeChange={listQuery.setPageSize}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
    />
  );
}
