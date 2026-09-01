'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button, Form, InlineAlert, TextField } from '@bcgov/design-system-react-components';
import { DataTable, type Column } from '@/src/components/DataTable';
import { SecondaryText } from '@/src/components/SecondaryText';
import { StatusTag } from '@/src/components/StatusTag';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import { fetchDocumentGenerationAudits } from '@/src/shared/api/sobaApiAdmin';
import type { DocumentGenerationAuditItem } from '@/src/types/admin';
import styles from './AdminPanel.module.css';

const AUDIT_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function DocumentGenerationAuditsPanel() {
  const dict = useDictionary();
  const dictAudits = dict.admin.audits;
  const { token } = useKeycloak();
  const { addNotification } = useNotificationStore();

  const [workspaceId, setWorkspaceId] = useState('');
  const [formId, setFormId] = useState('');
  const [items, setItems] = useState<DocumentGenerationAuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncatedAt, setTruncatedAt] = useState<number | null>(null);

  // Both ids are sent when filled, so every filled one has to be a uuid or the backend rejects the
  // whole request. At least one is required.
  const filledIds = [workspaceId.trim(), formId.trim()].filter((value) => value !== '');
  const valid = filledIds.length > 0 && filledIds.every((value) => UUID_PATTERN.test(value));

  const handleSearch = useCallback(async () => {
    if (!token || !valid) return;
    setLoading(true);
    try {
      const response = await fetchDocumentGenerationAudits(token, {
        workspaceId: workspaceId.trim() || undefined,
        formId: formId.trim() || undefined,
        limit: AUDIT_LIMIT,
      });
      setItems(response.items);
      setTruncatedAt(response.page?.hasMore ? response.page.limit : null);
      setError(null);
    } catch (cause) {
      setItems([]);
      setTruncatedAt(null);
      setError(dictAudits.loadError);
      addNotification({ text: dictAudits.loadError, type: 'error', consoleError: cause });
    } finally {
      setSearched(true);
      setLoading(false);
    }
  }, [token, valid, workspaceId, formId, addNotification, dictAudits.loadError]);

  const columns: Column<DocumentGenerationAuditItem>[] = useMemo(
    () => [
      {
        key: 'createdAt',
        label: dictAudits.columns.createdAt,
        render: (audit) => new Date(audit.createdAt).toLocaleString(dict.locale),
      },
      {
        key: 'outcome',
        label: dictAudits.columns.outcome,
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
          handleSearch().catch(() => undefined);
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

      {searched && truncatedAt !== null ? (
        <InlineAlert
          description={dict.admin.truncated.replace('{limit}', String(truncatedAt))}
          title={dictAudits.heading}
          variant="info"
          data-testid="audits-truncated"
        />
      ) : null}

      {searched ? (
        <DataTable<DocumentGenerationAuditItem>
          data={items}
          columns={columns}
          loading={loading}
          error={error}
          emptyMessage={dictAudits.empty}
          loadingMessage={dict.general.loading}
          caption={dictAudits.heading}
          keyExtractor={(audit) => audit.id}
        />
      ) : (
        <SecondaryText>{dictAudits.prompt}</SecondaryText>
      )}
    </div>
  );
}
