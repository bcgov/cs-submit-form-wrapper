'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { useAppSelector, useAppDispatch } from '@/lib/store';
import { setSelectedWorkspaceId } from '@/lib/slices/workspaceSlice';
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
  const { authenticated, token, initializing } = useKeycloak();

  const router = useRouter();
  const pathname = usePathname();

  const [forms, setForms] = useState<SobaFormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const locale = getLocaleFromPath(pathname);

  const {
    workspaces,
    writableWorkspaces,
    selectedWorkspaceId: stateSelectedWorkspaceId,
  } = useAppSelector((state) => state.workspace);
  const dispatch = useAppDispatch();

  // The picker filters this list only; a new form is targeted in the designer. So creation
  // depends on having any workspace the user can create in with its disclaimer accepted.
  const canCreate = useMemo(
    () => writableWorkspaces.some((w) => w.disclaimerAccepted),
    [writableWorkspaces],
  );
  // Create permission somewhere but no disclaimer accepted yet — the case worth prompting on.
  const needsDisclaimer = writableWorkspaces.length > 0 && !canCreate;

  const handleWorkspaceChange = useCallback(
    (key: string | number | null) => {
      const newWs = key ? String(key) : null;
      dispatch(setSelectedWorkspaceId(newWs));
    },
    [dispatch],
  );

  // Tracks the workspace whose forms we've already started loading. A ref (not state) dedupes
  // StrictMode's dev double-invoke while still re-fetching when the active workspace changes.
  const fetchedWorkspaceRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!authenticated || !token) return;
    const ws = stateSelectedWorkspaceId || undefined;

    fetchedWorkspaceRef.current = ws;
    void (async () => {
      setLoading(true);
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
  }, [authenticated, token, stateSelectedWorkspaceId, dict.general.sessionExpired]);

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
          selectedWorkspaceId={stateSelectedWorkspaceId}
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
    </>
  );
}

export default FormList;
