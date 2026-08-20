'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button as DSButton, InlineAlert } from '@bcgov/design-system-react-components';
import { DataTable, type Column } from '@/src/components/DataTable';
import { ListPageLayout, ListPageToolbar, ListPageAuthGate } from '@/src/components/ListPageLayout';
import { ListPageSearchField } from '@/src/components/ListPageSearchField';
import { DsPageHeading } from '@/app/ui/DsPageHeading';
import { RowActionButton } from '@/src/components/RowActionButton';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { useRouter, usePathname } from 'next/navigation';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { getSobaForms } from '@/src/shared/api/sobaApi';
import type { SobaFormSummary } from '@/src/shared/api/sobaApiDesign';
import { useFormatLongDate } from '@/src/shared/hooks/useFormatLongDate';
import { useAppSelector, useAppDispatch } from '@/lib/store';
import { WorkspaceSelector } from '@/app/ui/WorkspaceSelector';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import { selectActiveWorkspace } from '@/lib/slices/workspaceSlice';
import { FaFolder, FaLink } from 'react-icons/fa6';
import styles from './FormList.module.css';
import { isSessionExpired } from '@/src/shared/api/sobaFetch';

const CustomActionButtons = ({
  form,
  onAction,
  submitModeEnabled,
}: {
  form: SobaFormSummary;
  onAction: (name: string, id: string) => void;
  submitModeEnabled?: boolean;
}) => {
  // All actions (manage/submit/submissions) are keyed on the SOBA formId.
  const sobaFormId = form.id;

  const actions = [];
  if (submitModeEnabled) {
    actions.push({ name: 'submit', icon: <FaLink /> }, { name: 'submissions', icon: <FaFolder /> });
  }

  return (
    <div className="d-flex gap-2 justify-content-start">
      {actions.map((action) => (
        <RowActionButton
          key={action.name}
          data-testid={action.name + '-' + sobaFormId + '-button'}
          onPress={() => {
            if (!sobaFormId) return;
            onAction(action.name, sobaFormId);
          }}
        >
          {action.icon}
        </RowActionButton>
      ))}
    </div>
  );
};

function FormList({
  designModeEnabled = true,
  submitModeEnabled = true,
}: {
  designModeEnabled?: boolean;
  submitModeEnabled?: boolean;
}) {
  const dict = useDictionary();
  const dictFormList = dict.submission?.formList;
  const dictForm = dict.form;
  const { authenticated, token, initializing } = useKeycloak();

  const router = useRouter();
  const pathname = usePathname();

  const [forms, setForms] = useState<SobaFormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dispatch = useAppDispatch();
  const { addNotification } = useNotificationStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const locale = getLocaleFromPath(pathname);

  const { activeWorkspaceId, workspaces } = useAppSelector((state) => state.workspace);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  // No accepted workspace disclaimer → block form creation, mirroring the form designer.
  const needsDisclaimer = !!activeWorkspace && !activeWorkspace.disclaimerAccepted;

  // Tracks the workspace whose forms we've already started loading. A ref (not state) dedupes
  // StrictMode's dev double-invoke while still re-fetching when the active workspace changes.
  const fetchedWorkspaceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!(authenticated && token && activeWorkspaceId)) return;
    const ws = activeWorkspaceId;
    // Skip StrictMode's duplicate mount run; a real workspace change has a new id and proceeds.
    if (fetchedWorkspaceRef.current === ws) return;
    fetchedWorkspaceRef.current = ws;
    setLoading(true);
    void (async () => {
      try {
        const data = await getSobaForms(token as string, ws);
        // Ignore a superseded response if the active workspace changed while this was in flight.
        if (fetchedWorkspaceRef.current !== ws) return;
        setForms(Array.isArray(data.items) ? data.items : []);
      } catch (err: unknown) {
        if (fetchedWorkspaceRef.current !== ws) return;
        if (isSessionExpired(err)) {
          setError(dict.general.sessionExpired);
        } else if (err && typeof err === 'object' && 'message' in err) {
          setError((err as { message: string }).message);
        }
      } finally {
        if (fetchedWorkspaceRef.current === ws) setLoading(false);
      }
    })();
    // No workspace selected for this tab: forms are workspace-scoped, so we render a
    // "select a workspace" prompt (below) instead of calling the API.
  }, [authenticated, token, activeWorkspaceId, dict.general.sessionExpired]);

  const filteredForms = useMemo(() => {
    if (!searchQuery.trim()) return forms;
    const query = searchQuery.toLowerCase();
    return forms.filter((f) => (f.name || '').toLowerCase().includes(query));
  }, [forms, searchQuery]);

  // Removed unused totalPages
  const paginatedForms = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredForms.slice(start, start + pageSize);
  }, [filteredForms, currentPage, pageSize]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  const handleAction = useCallback(
    (name: string, id: string) => {
      if (name === 'manage') {
        router.push(`/${locale}/designer/${id}`);
      } else if (name === 'submit') {
        router.push(`/${locale}/form/${id}`);
      } else if (name === 'submissions') {
        router.push(`/${locale}/submissions/${id}`);
      }
    },
    [router, locale],
  );

  // Round-trip through GET /workspaces/:id so the backend verifies membership before we
  // persist the tab workspace to sessionStorage and Redux, then open the forms list.
  const handleWorkspaceChange = (key: string | number | null) => {
    if (!token || key == null) return;
    const workspaceId = String(key);
    if (workspaceId === activeWorkspaceId) return;
    dispatch(selectActiveWorkspace({ token, workspaceId }))
      .unwrap()
      .then(() => {
        router.push(`/${locale}/forms`);
      })
      .catch((error) => {
        addNotification({
          text: dict.general.workspaceSwitchError || 'Error switching workspace',
          type: 'error',
          consoleError: error,
        });
      });
  };

  const formatLongDate = useFormatLongDate();

  const columns: Column<SobaFormSummary>[] = useMemo(
    () => [
      {
        key: 'name',
        label: dictFormList?.columns?.name || dictForm?.nameLabel || 'Form Name',
        width: '40%',
        render: (form: SobaFormSummary) => {
          return designModeEnabled ? (
            <RowActionButton
              main
              data-testid={'form-link-' + form.id}
              onPress={() => handleAction('manage', form.id)}
            >
              {form.name || dictForm?.nameLabel || 'Untitled Form'}
            </RowActionButton>
          ) : (
            <span>{form.name || dictForm?.nameLabel || 'Untitled Form'}</span>
          );
        },
      },
      {
        key: 'actions',
        label: dictFormList?.columns?.quickLinks || 'Quick Links',
        align: 'start',
        render: (form: SobaFormSummary) => (
          <CustomActionButtons
            form={form}
            onAction={handleAction}
            submitModeEnabled={submitModeEnabled}
          />
        ),
      },
      {
        key: 'created',
        label: dictFormList?.columns?.createdBy || 'Created By',
        render: (form: SobaFormSummary) => {
          if (!form.createdBy) return <span className="text-muted small">—</span>;
          return <span className="small">{form.createdBy}</span>;
        },
      },
      {
        key: 'updated',
        label: dictFormList?.columns?.createdAt || 'Created Date',
        render: (form: SobaFormSummary) => (
          <span className="small">{formatLongDate(form.createdAt)}</span>
        ),
      },
    ],
    [handleAction, dictFormList, dictForm, designModeEnabled, submitModeEnabled, formatLongDate],
  );

  // Auth gate only — loading (including Keycloak init) is shown inside the table
  // body so the page heading stays visible throughout.
  if (!authenticated && !initializing) {
    return <ListPageAuthGate>{dict.general.notAuthenticated}</ListPageAuthGate>;
  }

  return (
    <ListPageLayout>
      <DsPageHeading id="forms-heading">{dict.general.forms}</DsPageHeading>
      <ListPageToolbar align={designModeEnabled ? 'between' : 'end'}>
        <ListPageSearchField
          value={searchQuery}
          onChange={handleSearchChange}
          testIdPrefix="forms"
          showSearchButton={true}
        />
        {designModeEnabled ? (
          <DSButton
            variant="primary"
            data-testid="create-form-button"
            isDisabled={!activeWorkspaceId || needsDisclaimer}
            onPress={() => router.push(`/${locale}/designer`)}
          >
            Create
          </DSButton>
        ) : null}
      </ListPageToolbar>
      <div className={`mb-2 ${styles.workspaceField}`}>
        <div className="mb-2">{dict.workspaces.workspace}</div>
        <div>
          <WorkspaceSelector
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            label={dict.header.selectWorkspace}
            onChange={handleWorkspaceChange}
            size="medium"
          />
        </div>
      </div>

      {needsDisclaimer ? (
        <InlineAlert
          variant="warning"
          title={
            dict.form.disclaimerRequired ||
            'Accept the workspace disclaimer in workspace Settings before creating a form.'
          }
          data-testid="forms-disclaimer-required-alert"
        />
      ) : null}

      {authenticated && !initializing && !activeWorkspaceId ? (
        <InlineAlert variant="info" data-testid="forms-select-workspace">
          {dict.general.selectWorkspace}
        </InlineAlert>
      ) : (
        <DataTable<SobaFormSummary>
          data={paginatedForms as SobaFormSummary[]}
          columns={columns}
          loading={loading || initializing}
          error={error}
          emptyMessage="No forms found matching your criteria."
          loadingMessage={dict.general.loading}
          itemName="items"
          caption={dict.general.forms}
          pageSize={pageSize}
          currentPage={currentPage}
          totalItems={filteredForms.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={[5, 10, 25, 50]}
          keyExtractor={(form) => form.id}
        />
      )}
    </ListPageLayout>
  );
}

export default FormList;
