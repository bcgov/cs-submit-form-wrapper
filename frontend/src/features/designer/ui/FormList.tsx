'use client';

import { useMemo, useCallback } from 'react';
import { Button as DSButton } from '@bcgov/design-system-react-components';
import { DataTable, type Column } from '@/src/components/DataTable';
import { Tag } from '@/src/components/Tag';
import { ListPageToolbar, ListPageAuthGate } from '@/src/components/ListPageLayout';
import { ListPageSearchField } from '@/src/components/ListPageSearchField';
import { RowActionButton } from '@/src/components/RowActionButton';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { useRouter, usePathname } from 'next/navigation';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { getSobaForms } from '@/src/shared/api/sobaApi';
import type { SobaFormSummary } from '@/src/shared/api/sobaApiDesign';
import { useFormatLongDate } from '@/src/shared/hooks/useFormatLongDate';
import { usePageNotices } from '@/src/components/PageHeader';
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import { useWorkspaces, useWritableWorkspaces } from '@/src/shared/api/useWorkspaces';
import { FORMS_LIST_QUERY } from '@/src/shared/list/listQueryMemory';
import { PAGE_SIZE_OPTIONS, useListQuery } from '@/src/shared/list/useListQuery';
import { listReadConfig } from '@/src/shared/api/swrConfig';
import { WorkspaceSelector } from '@/app/ui/WorkspaceSelector';
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
  const { authenticated, initializing } = useKeycloak();

  const router = useRouter();
  const pathname = usePathname();

  const locale = getLocaleFromPath(pathname);

  const { workspaces, loaded: workspacesLoaded, error: workspacesError } = useWorkspaces();
  const { workspaces: writableWorkspaces } = useWritableWorkspaces();

  const listQuery = useListQuery(FORMS_LIST_QUERY);
  const workspaceParam = listQuery.filters.workspace ?? null;
  // The filter comes from the URL, so it can name a workspace that does not exist or that this user
  // cannot see. Resolve it against their own list before it reaches the request.
  const selectedWorkspaceId =
    workspaceParam && workspaces.some((w) => w.id === workspaceParam) ? workspaceParam : undefined;
  const workspaceRejected = workspacesLoaded && !!workspaceParam && !selectedWorkspaceId;
  // The request is held back until the filter can be resolved, so the table is loading, not empty.
  const waitingForWorkspaces = !!workspaceParam && !workspacesLoaded && !workspacesError;

  const {
    data,
    isLoading,
    error: loadError,
  } = useAuthedSWR(
    // An unresolved filter must not fall through to an unscoped read, so wait for the workspaces.
    workspaceParam && !workspacesLoaded
      ? null
      : [
          'forms',
          selectedWorkspaceId ?? null,
          listQuery.offset,
          listQuery.pageSize,
          listQuery.sort,
          listQuery.q,
        ],
    (token) =>
      getSobaForms(token, {
        offset: listQuery.offset,
        limit: listQuery.pageSize,
        sort: listQuery.sort,
        q: listQuery.q,
        workspaceId: selectedWorkspaceId,
      }),
    listReadConfig,
  );

  const forms: SobaFormSummary[] = useMemo(
    () => (Array.isArray(data?.items) ? data.items : []),
    [data],
  );

  const error = useMemo(() => {
    const failure = loadError ?? workspacesError;
    if (!failure) return null;
    if (isSessionExpired(failure)) return dict.general.sessionExpired;
    return failure instanceof Error ? failure.message : String(failure);
  }, [loadError, workspacesError, dict.general.sessionExpired]);

  // The picker filters this list only; a new form is targeted in the designer. So creation
  // depends on having any workspace the user can create in with its disclaimer accepted.
  const canCreate = useMemo(
    () => writableWorkspaces.some((w) => w.disclaimerAccepted),
    [writableWorkspaces],
  );
  // Create permission somewhere but no disclaimer accepted yet — the case worth prompting on.
  const needsDisclaimer = writableWorkspaces.length > 0 && !canCreate;

  const { setFilters } = listQuery;
  const handleWorkspaceChange = useCallback(
    (key: string | number | null) => setFilters(key ? { workspace: String(key) } : {}),
    [setFilters],
  );

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

  usePageNotices([
    workspaceRejected && {
      id: 'workspace-filter',
      variant: 'warning' as const,
      body: dict.workspaces.unavailableFilter,
      action: {
        label: dict.workspaces.clearFilter,
        onPress: () => setFilters({}),
      },
    },
    needsDisclaimer && {
      id: 'disclaimer',
      variant: 'warning' as const,
      body:
        dict.form.disclaimerRequired ||
        'Accept the workspace disclaimer in workspace Settings before creating a form.',
    },
  ]);

  const formatLongDate = useFormatLongDate();

  const columns: Column<SobaFormSummary>[] = useMemo(
    () => [
      {
        key: 'name',
        label: dictFormList?.columns?.name || dictForm?.nameLabel || 'Form Name',
        width: '40%',
        sortField: 'name',
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
        key: 'workspace',
        label: dict.workspaces?.workspace || 'Workspace',
        render: (form: SobaFormSummary) => {
          const ws = workspaces.find((w) => w.id === form.workspaceId);
          return (
            <Tag
              text={ws?.name || form.workspaceId}
              color="yellow"
              data-testid={`workspace-tag-${form.id}`}
            />
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
        key: 'createdBy',
        label: dictFormList?.columns?.createdBy || 'Created By',
        render: (form: SobaFormSummary) => {
          if (!form.createdBy) return <span className="text-muted small">—</span>;
          return <span className="small">{form.createdBy}</span>;
        },
      },
      {
        key: 'createdAt',
        label: dictFormList?.columns?.createdAt || 'Created Date',
        sortField: 'createdAt',
        sortDefaultDirection: 'desc',
        render: (form: SobaFormSummary) => (
          <span className="small">{formatLongDate(form.createdAt)}</span>
        ),
      },
    ],
    [
      handleAction,
      dictFormList,
      dictForm,
      dict.workspaces,
      workspaces,
      designModeEnabled,
      submitModeEnabled,
      formatLongDate,
    ],
  );

  // Auth gate only — loading (including Keycloak init) is shown inside the table
  // body so the page heading stays visible throughout.
  if (!authenticated && !initializing) {
    return <ListPageAuthGate>{dict.general.notAuthenticated}</ListPageAuthGate>;
  }

  return (
    <>
      <ListPageToolbar align={designModeEnabled ? 'between' : 'end'}>
        <ListPageSearchField
          value={listQuery.searchInput}
          onChange={listQuery.setSearchInput}
          onSubmit={listQuery.commitSearch}
          testIdPrefix="forms"
          showSearchButton={true}
        />
        {designModeEnabled ? (
          <DSButton
            variant="primary"
            data-testid="create-form-button"
            isDisabled={!canCreate}
            onPress={() => router.push(`/${locale}/designer`)}
          >
            {dict.general.create}
          </DSButton>
        ) : null}
      </ListPageToolbar>
      <div className={`mb-2 ${styles.workspaceField}`}>
        <WorkspaceSelector
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId ?? null}
          label={dict.workspaces.workspace}
          onChange={handleWorkspaceChange}
          allLabel={dict.workspaces.allWorkspaces}
          size="medium"
        />
      </div>

      <DataTable<SobaFormSummary>
        data={forms}
        columns={columns}
        loading={isLoading || initializing || waitingForWorkspaces}
        error={error}
        emptyMessage="No forms found matching your criteria."
        loadingMessage={dict.general.loading}
        itemName="items"
        caption={dict.general.forms}
        pageSize={listQuery.pageSize}
        currentPage={listQuery.page}
        totalItems={data?.page?.total}
        onPageChange={listQuery.setPage}
        onPageSizeChange={listQuery.setPageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        sort={listQuery.sort}
        onSortChange={listQuery.setSort}
        keyExtractor={(form) => form.id}
      />
    </>
  );
}

export default FormList;
