'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Button as DSButton } from '@bcgov/design-system-react-components';
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
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import { useWorkspaces, useWritableWorkspaces } from '@/src/shared/api/useWorkspaces';
import {
  FORMS_LIST_QUERY,
  NAV_MARKER,
  isNavArrival,
  readUrlParams,
  recallListQuery,
  rememberListQuery,
  urlHasListParams,
  type ListQueryParams,
} from '@/src/shared/list/listQueryMemory';
import { WorkspaceSelector } from '@/app/ui/WorkspaceSelector';
import { FaDatabase, FaLink } from 'react-icons/fa6';
import styles from './FormList.module.css';
import { isSessionExpired } from '@/src/shared/api/sobaFetch';

const CustomActionButtons = ({
  form,
  onAction,
  designModeEnabled,
}: {
  form: SobaFormSummary;
  onAction: (name: string, id: string) => void;
  designModeEnabled?: boolean;
}) => {
  // All actions (manage/submit/submissions) are keyed on the SOBA formId.
  const sobaFormId = form.id;

  const actions = [];
  // Both quick links open designer tabs, and the designer page 404s without design mode.
  if (designModeEnabled) {
    actions.push(
      { name: 'submit', icon: <FaLink /> },
      { name: 'submissions', icon: <FaDatabase /> },
    );
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

function FormList({ designModeEnabled = true }: { designModeEnabled?: boolean }) {
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

  const { workspaces, loaded: workspacesLoaded } = useWorkspaces();
  const { workspaces: writableWorkspaces } = useWritableWorkspaces();

  // Only a link from inside the app asks for the list as the user left it. A bare URL is a bookmark
  // or someone else's link, and means the unfiltered list. Read during render, not from an effect:
  // an effect would let the first request go out unscoped and land another workspace's rows first.
  // Not keyed on mount, because clicking the nav link while already on this page does not remount.
  const arrivalQuery = useMemo(
    () =>
      isNavArrival(searchParams) && !urlHasListParams(FORMS_LIST_QUERY, searchParams)
        ? recallListQuery(FORMS_LIST_QUERY)
        : null,
    [searchParams],
  );

  // The URL wins as soon as it says anything, so a cleared filter stays cleared rather than reading
  // as "nothing set, restore again".
  const workspaceParam = urlHasListParams(FORMS_LIST_QUERY, searchParams)
    ? searchParams.get('workspace')
    : (arrivalQuery?.workspace ?? null);
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

  const forms: SobaFormSummary[] = useMemo(
    () => (Array.isArray(data?.items) ? data.items : []),
    [data],
  );

  const error = useMemo(() => {
    if (!loadError) return null;
    if (isSessionExpired(loadError)) return dict.general.sessionExpired;
    return loadError instanceof Error ? loadError.message : String(loadError);
  }, [loadError, dict.general.sessionExpired]);

  const writeListParams = useCallback(
    (next: ListQueryParams) => {
      const params = new URLSearchParams(searchParams.toString());
      // Consumed on arrival; leaving it in would make a copied URL restore the reader's own view.
      params.delete(NAV_MARKER);
      for (const name of FORMS_LIST_QUERY.params) {
        if (next[name]) params.set(name, next[name]);
        else params.delete(name);
      }
      const qs = params.toString();
      // Next keeps useSearchParams in sync with replaceState. A router navigation would re-run the
      // page's server component for what is only a client-side filter change.
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
      // Recorded from the choice, not from the URL: reading it back would race the replaceState
      // above and record the pre-change query.
      rememberListQuery(FORMS_LIST_QUERY, next);
    },
    [searchParams, pathname],
  );

  const applyListParams = useCallback(
    (next: ListQueryParams) => {
      // A different scope means a different set of rows, so the page number no longer refers to
      // anything the user chose.
      setCurrentPage(1);
      writeListParams(next);
    },
    [writeListParams],
  );

  // Each distinct URL is handled once. Re-running on an in-page change would undo a filter the user
  // just cleared, because a cleared filter and a fresh arrival both look like a URL with no params.
  const handledSearch = useRef<string | null>(null);
  useEffect(() => {
    const search = searchParams.toString();
    if (handledSearch.current === search) return;
    const firstArrival = handledSearch.current === null;
    handledSearch.current = search;

    // Writing drops the nav marker, so it never survives into a URL the user might copy.
    if (arrivalQuery) {
      writeListParams(arrivalQuery);
      return;
    }
    if (isNavArrival(searchParams)) {
      writeListParams(readUrlParams(FORMS_LIST_QUERY, searchParams));
      return;
    }
    // A link that names a scope is a choice, wherever it came from. A bare one is a visit, and must
    // not erase the view the user set for this tab. Later in-page changes record themselves.
    if (firstArrival && urlHasListParams(FORMS_LIST_QUERY, searchParams)) {
      rememberListQuery(FORMS_LIST_QUERY, readUrlParams(FORMS_LIST_QUERY, searchParams));
    }
  }, [arrivalQuery, searchParams, writeListParams]);

  // The picker filters this list only; a new form is targeted in the designer. So creation
  // depends on having any workspace the user can create in with its disclaimer accepted.
  const canCreate = useMemo(
    () => writableWorkspaces.some((w) => w.disclaimerAccepted),
    [writableWorkspaces],
  );
  // Create permission somewhere but no disclaimer accepted yet — the case worth prompting on.
  const needsDisclaimer = writableWorkspaces.length > 0 && !canCreate;

  const handleWorkspaceChange = useCallback(
    (key: string | number | null) => applyListParams(key ? { workspace: String(key) } : {}),
    [applyListParams],
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
        if (designModeEnabled) {
          router.push(`/${locale}/designer/${id}`);
        } else {
          router.push(`/${locale}/form/${id}`);
        }
      } else if (name === 'submit') {
        router.push(`/${locale}/designer/${id}?tab=share`);
      } else if (name === 'submissions') {
        router.push(`/${locale}/designer/${id}?tab=submissions`);
      }
    },
    [router, locale, designModeEnabled],
  );

  usePageNotices([
    workspaceRejected && {
      id: 'workspace-filter',
      variant: 'warning' as const,
      body: dict.workspaces.unavailableFilter,
      action: {
        label: dict.workspaces.clearFilter,
        onPress: () => applyListParams({}),
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
          return (
            <RowActionButton
              main
              data-testid={'form-link-' + form.id}
              onPress={() => handleAction('manage', form.id)}
            >
              {form.name || dictForm?.nameLabel || 'Untitled Form'}
            </RowActionButton>
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
            designModeEnabled={designModeEnabled}
          />
        ),
      },
      {
        key: 'updated',
        label: dictFormList?.columns?.createdAt || 'Created Date',
        render: (form: SobaFormSummary) => (
          <span className="small">{formatLongDate(form.createdAt)}</span>
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
    ],
    [
      handleAction,
      dictFormList,
      dictForm,
      dict.workspaces,
      workspaces,
      designModeEnabled,
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
      <div className={`d-flex align-items-end gap-2`}>
        <WorkspaceSelector
          className={`${styles.workspaceField}`}
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId ?? null}
          label={dict.workspaces.workspace}
          onChange={handleWorkspaceChange}
          allLabel={dict.workspaces.allWorkspaces}
          size="medium"
        />
        <DSButton
          variant="secondary"
          data-testid="clear-filters-button"
          onPress={() => {
            setSearchQuery('');
            handleWorkspaceChange(null);
          }}
        >
          {dict.general.clearFilters || 'Clear'}
        </DSButton>
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
