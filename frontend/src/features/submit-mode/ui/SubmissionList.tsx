'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { getSobaSubmissions } from '@/src/shared/api/sobaApiDesign';
import type { SubmissionListItem } from '@/src/types/submissions';
import { DataTable, Column } from '@/src/components/DataTable';
import { ListPageLayout } from '@/src/components/ListPageLayout';
import { DsPageHeading } from '@/app/ui/DsPageHeading';
import { RowActionButton } from '@/src/components/RowActionButton';
import { WorkflowStateBadge } from './WorkflowStateBadge';

interface SubmissionListProps {
  formId?: string;
}

export function SubmissionList({ formId }: SubmissionListProps = {}) {
  const { authenticated, token, initializing } = useKeycloak();
  const dict = useDictionary();
  const router = useRouter();
  const pathname = usePathname();
  const locale = getLocaleFromPath(pathname);
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const paginatedSubmissions = useMemo(
    () => submissions.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [submissions, currentPage, pageSize],
  );

  useEffect(() => {
    if (authenticated && token) {
      const fetchSubmissions = async () => {
        try {
          // `formId` is the SOBA formId (routed from FormList); list submissions for it directly.
          const params = formId ? { formId } : undefined;
          const data = await getSobaSubmissions(token, params);
          setSubmissions(data.items || []);
        } catch {
          // Submissions failed to load; the empty state is shown to the user.
        } finally {
          setIsLoaded(true);
        }
      };

      fetchSubmissions();
    }
    // No workspace selected for this tab: submissions are workspace-scoped, so we render a
    // "select a workspace" prompt (below) instead of calling the API.
  }, [authenticated, token, formId]);

  const loading = initializing || (authenticated && (!token || !isLoaded));

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
    <ListPageLayout>
      <DsPageHeading id="submissions-heading">
        {dict.submission?.submissions || 'Submissions'}
      </DsPageHeading>
      <DataTable<SubmissionListItem>
        data={paginatedSubmissions}
        columns={columns}
        loading={loading}
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
    </ListPageLayout>
  );
}
