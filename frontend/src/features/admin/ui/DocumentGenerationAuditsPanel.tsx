'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button, Form, TextField } from '@bcgov/design-system-react-components';
import { DataTable, type Column } from '@/src/components/DataTable';
import { SecondaryText } from '@/src/components/SecondaryText';
import { StatusTag } from '@/src/components/StatusTag';
import { useDictionary } from '@/app/[lang]/Providers';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import { useDocumentGenerationAudits } from '../useAdminData';
import { DOCGEN_AUDITS_LIST_QUERY } from '@/src/shared/list/listQueryMemory';
import { PAGE_SIZE_OPTIONS, useListQuery } from '@/src/shared/list/useListQuery';
import type { DocumentGenerationAuditItem } from '@/src/types/admin';
import styles from './AdminPanel.module.css';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function DocumentGenerationAuditsPanel() {
  const dict = useDictionary();
  const dictAudits = dict.admin.audits;
  const { addNotification } = useNotificationStore();

  const [workspaceId, setWorkspaceId] = useState('');
  const [formId, setFormId] = useState('');
  // The filter the admin searched with, which is what the read is keyed on. Editing the fields
  // does not re-read until they search again.
  const [filter, setFilter] = useState<{ workspaceId?: string; formId?: string } | null>(null);

  const listQuery = useListQuery(DOCGEN_AUDITS_LIST_QUERY);
  const reportLoadError = useCallback(
    (cause: unknown) => {
      addNotification({ text: dictAudits.loadError, type: 'error', consoleError: cause });
    },
    [addNotification, dictAudits.loadError],
  );
  const {
    audits,
    total,
    isLoading: loading,
    error: loadError,
  } = useDocumentGenerationAudits(
    filter,
    {
      offset: listQuery.offset,
      limit: listQuery.pageSize,
      sort: listQuery.sort,
    },
    reportLoadError,
  );
  const error = loadError ? dictAudits.loadError : null;

  // Both ids are sent when filled, so every filled one has to be a uuid or the backend rejects the
  // whole request. At least one is required.
  const filledIds = [workspaceId.trim(), formId.trim()].filter((value) => value !== '');
  const valid = filledIds.length > 0 && filledIds.every((value) => UUID_PATTERN.test(value));

  const { setPage } = listQuery;
  const handleSearch = useCallback(() => {
    if (!valid) return;
    // A new filter is a different set of rows, so the page number no longer refers to anything.
    setPage(1);
    setFilter({
      workspaceId: workspaceId.trim() || undefined,
      formId: formId.trim() || undefined,
    });
  }, [valid, workspaceId, formId, setPage]);

  const columns: Column<DocumentGenerationAuditItem>[] = useMemo(
    () => [
      {
        key: 'createdAt',
        label: dictAudits.columns.createdAt,
        sortField: 'createdAt',
        render: (audit) => new Date(audit.createdAt).toLocaleString(dict.locale),
      },
      {
        key: 'outcome',
        label: dictAudits.columns.outcome,
        sortField: 'outcome',
        render: (audit) => (
          <StatusTag
            label={audit.outcome}
            variant={audit.outcome === 'success' ? 'success' : 'neutral'}
            data-testid={`audit-outcome-${audit.id}`}
          />
        ),
      },
      { key: 'mode', label: dictAudits.columns.mode },
      { key: 'backendCode', label: dictAudits.columns.backend },
      {
        key: 'durationMs',
        label: dictAudits.columns.duration,
        sortField: 'durationMs',
        align: 'end',
        render: (audit) => `${audit.durationMs} ms`,
      },
      {
        key: 'detail',
        label: dictAudits.columns.detail,
        render: (audit) => (
          <span className="d-inline-flex flex-column">
            <span>{audit.errorDetail ?? '—'}</span>
            {audit.httpStatus !== null ? (
              <SecondaryText>HTTP {audit.httpStatus}</SecondaryText>
            ) : null}
          </span>
        ),
      },
      {
        key: 'submissionId',
        label: dictAudits.columns.submission,
        render: (audit) => <SecondaryText>{audit.submissionId}</SecondaryText>,
      },
    ],
    [dictAudits.columns, dict.locale],
  );

  return (
    <div className={styles.tabContent}>
      <p className={styles.panelIntro}>{dictAudits.intro}</p>
      <Form
        className="d-flex align-items-end gap-3 flex-wrap mb-3"
        onSubmit={(event) => {
          event.preventDefault();
          handleSearch();
        }}
      >
        <TextField
          label={dictAudits.workspaceIdLabel}
          value={workspaceId}
          onChange={setWorkspaceId}
          isDisabled={loading}
          data-testid="audits-workspace-id"
        />
        <TextField
          label={dictAudits.formIdLabel}
          value={formId}
          onChange={setFormId}
          isDisabled={loading}
          data-testid="audits-form-id"
        />
        <Button
          type="submit"
          variant="primary"
          isDisabled={loading || !valid}
          data-testid="audits-search"
        >
          {dict.general.search}
        </Button>
      </Form>

      {filter ? (
        <DataTable<DocumentGenerationAuditItem>
          data={audits}
          columns={columns}
          loading={loading}
          error={error}
          emptyMessage={dictAudits.empty}
          loadingMessage={dict.general.loading}
          caption={dictAudits.heading}
          totalItems={total}
          pageSize={listQuery.pageSize}
          currentPage={listQuery.page}
          onPageChange={listQuery.setPage}
          onPageSizeChange={listQuery.setPageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          sort={listQuery.sort}
          onSortChange={listQuery.setSort}
          keyExtractor={(audit) => audit.id}
        />
      ) : (
        <SecondaryText>{dictAudits.prompt}</SecondaryText>
      )}
    </div>
  );
}
