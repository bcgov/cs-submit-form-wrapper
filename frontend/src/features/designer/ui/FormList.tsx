'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Button as DSButton,
} from '@bcgov/design-system-react-components';
import { DataTable, type Column } from '@/src/components/DataTable';
import { Tag } from '@/src/components/Tag';
import { ListPageToolbar, ListPageAuthGate } from '@/src/components/ListPageLayout';
import { ListPageSearchField } from '@/src/components/ListPageSearchField';
import { RowActionButton } from '@/src/components/RowActionButton';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { getSobaForms } from '@/src/shared/api/sobaApi';
import type { SobaFormSummary } from '@/src/shared/api/sobaApiDesign';
import { useFormatLongDate } from '@/src/shared/hooks/useFormatLongDate';
import { usePageNotices } from '@/src/components/PageHeader';
import { useAppSelector } from '@/lib/store';
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
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
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const locale = getLocaleFromPath(pathname);

  const {
    workspaces,
    writableWorkspaces,
    status: workspaceStatus,
  } = useAppSelector((state) => state.workspace);

  const workspacesLoaded = workspaceStatus === 'succeeded';
  const workspaceParam = searchParams.get('workspace');
  // The filter comes from the URL, so it can name a workspace that does not exist or that this user
  // cannot see. Resolve it against their own list before it reaches the request.
  const selectedWorkspaceId =
    workspaceParam && workspaces.some((w) => w.id === workspaceParam) ? workspaceParam : undefined;
  const workspaceRejected = workspacesLoaded && !!workspaceParam && !selectedWorkspaceId;

  const {
    data,
    isLoading,
    error: loadError,
  } = useAuthedSWR(
    // An unresolved filter must not fall through to an unscoped read, so wait for the workspaces.
    workspaceParam && !workspacesLoaded ? null : ['forms', selectedWorkspaceId ?? null],
    (token) => getSobaForms(token, selectedWorkspaceId),
  );

  // parseJson casts the body unchecked, so a malformed 200 can land a non-array here.
  const forms: SobaFormSummary[] = useMemo(
    () => (Array.isArray(data?.items) ? data.items : []),
    [data],
  );

  const error = useMemo(() => {
    if (!loadError) return null;
    if (isSessionExpired(loadError)) return dict.general.sessionExpired;
    return loadError instanceof Error ? loadError.message : String(loadError);
  }, [loadError, dict.general.sessionExpired]);

  const setWorkspaceParam = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set('workspace', next);
      else params.delete('workspace');
      const qs = params.toString();
      // Next keeps useSearchParams in sync with replaceState. A router navigation would re-run the
      // page's server component for what is only a client-side filter change.
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
    },
    [searchParams, pathname],
  );

  // The picker filters this list only; a new form is targeted in the designer. So creation
  // depends on having any workspace the user can create in with its disclaimer accepted.
  const canCreate = useMemo(
    () => writableWorkspaces.some((w) => w.disclaimerAccepted),
    [writableWorkspaces],
  );
  // Create permission somewhere but no disclaimer accepted yet — the case worth prompting on.
  const needsDisclaimer = writableWorkspaces.length > 0 && !canCreate;

  const handleWorkspaceChange = useCallback(
    (key: string | number | null) => setWorkspaceParam(key ? String(key) : null),
    [setWorkspaceParam],
  );

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

  usePageNotices([
    workspaceRejected && {
      id: 'workspace-filter',
      variant: 'warning' as const,
      body: dict.workspaces.unavailableFilter,
      action: {
        label: dict.workspaces.clearFilter,
        onPress: () => setWorkspaceParam(null),
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
          value={searchQuery}
          onChange={handleSearchChange}
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
        data={paginatedForms as SobaFormSummary[]}
        columns={columns}
        loading={isLoading || initializing}
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
    </>
  );
}

export default FormList;
