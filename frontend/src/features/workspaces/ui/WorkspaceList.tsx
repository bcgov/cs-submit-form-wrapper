'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button as DSButton } from '@bcgov/design-system-react-components';
import { DataTable, type Column } from '@/src/components/DataTable';
import { ListPageToolbar, ListPageAuthGate } from '@/src/components/ListPageLayout';
import { ListPageSearchField } from '@/src/components/ListPageSearchField';
import { RowActionButton } from '@/src/components/RowActionButton';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { useRouter, usePathname } from 'next/navigation';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { useAppDispatch, useAppSelector } from '@/lib/store';
import { useWorkspaces } from '@/src/shared/api/useWorkspaces';
import { loadCurrentUser } from '@/lib/slices/currentUserSlice';
import type { WorkspaceItem } from '@/src/types/workspaces';
import { WorkspaceRoleBadge } from './WorkspaceRoleBadge';
import { isWorkspaceManageRole } from '../workspaceRoles';

const WorkspaceActionButtons = ({
  workspace,
  onAction,
  showFormsAction,
  dictActions,
}: {
  workspace: WorkspaceItem;
  onAction: (name: string, id: string) => void;
  showFormsAction?: boolean;
  dictActions: { manage: string; forms: string };
}) => {
  const actions = [];
  if (isWorkspaceManageRole(workspace.role)) {
    actions.push({ name: 'manage', title: dictActions.manage });
  }
  if (showFormsAction) {
    actions.push({ name: 'forms', title: dictActions.forms });
  }

  return (
    <div className="d-flex gap-2 justify-content-start">
      {actions.map((action) => (
        <RowActionButton
          key={action.name}
          data-testid={action.name + '-' + workspace.id + '-button'}
          onPress={() => onAction(action.name, workspace.id)}
        >
          {action.title}
        </RowActionButton>
      ))}
    </div>
  );
};

function WorkspaceList({ showFormsAction = true }: Readonly<{ showFormsAction?: boolean }>) {
  const dict = useDictionary();
  const dictWorkspaces = dict.workspaces;
  const { authenticated, token, initializing } = useKeycloak();
  const dispatch = useAppDispatch();

  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const locale = getLocaleFromPath(pathname);

  const { workspaces, isLoading: workspacesLoading, error: workspacesError } = useWorkspaces();
  const { data: currentUser, status: currentUserStatus } = useAppSelector(
    (state) => state.currentUser,
  );

  useEffect(() => {
    if (authenticated && token && currentUserStatus === 'idle') {
      dispatch(loadCurrentUser(token));
    }
  }, [authenticated, token, currentUserStatus, dispatch]);

  const filteredWorkspaces = useMemo(() => {
    if (!searchQuery.trim()) return workspaces;
    const query = searchQuery.toLowerCase();
    return workspaces.filter((w) => (w.name || '').toLowerCase().includes(query));
  }, [workspaces, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredWorkspaces.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);

  const paginatedWorkspaces = useMemo(() => {
    const start = (effectivePage - 1) * pageSize;
    return filteredWorkspaces.slice(start, start + pageSize);
  }, [filteredWorkspaces, effectivePage, pageSize]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  const handleSelect = useCallback(
    (workspaceId: string, destination: 'forms' | 'manage') => {
      if (!token) return;

      if (destination === 'forms') {
        // Opening a workspace's forms is an explicit scope choice, so it seeds the list filter.
        router.push(`/${locale}/forms?workspace=${encodeURIComponent(workspaceId)}`);
      } else {
        router.push(`/${locale}/workspace/${workspaceId}`);
      }
    },
    [token, router, locale],
  );

  const handleAction = useCallback(
    (name: string, id: string) => {
      if (name === 'manage') {
        handleSelect(id, 'manage');
      } else if (name === 'forms') {
        handleSelect(id, 'forms');
      }
    },
    [handleSelect],
  );

  const columns: Column<WorkspaceItem>[] = useMemo(
    () => [
      {
        key: 'name',
        label: dictWorkspaces.columns.name,
        width: '40%',
        render: (workspace: WorkspaceItem) => (
          <span className="d-inline-flex align-items-center gap-2">
            <RowActionButton
              main
              data-testid={'workspace-link-' + workspace.id}
              onPress={() => handleSelect(workspace.id, 'forms')}
            >
              {workspace.name}
            </RowActionButton>
          </span>
        ),
      },
      {
        key: 'actions',
        label: dictWorkspaces.columns.actions,
        align: 'start',
        render: (workspace: WorkspaceItem) => (
          <WorkspaceActionButtons
            workspace={workspace}
            onAction={handleAction}
            showFormsAction={showFormsAction}
            dictActions={dictWorkspaces.actions}
          />
        ),
      },
      {
        key: 'roles',
        label: dictWorkspaces.columns.roles,
        render: (workspace: WorkspaceItem) => (
          <WorkspaceRoleBadge role={workspace.role} data-testid={'role-' + workspace.id} />
        ),
      },
    ],
    [handleSelect, handleAction, dictWorkspaces, showFormsAction],
  );

  const loading = workspacesLoading;
  const showCreateAction = currentUser?.capabilities?.canCreateWorkspace === true;

  if (!authenticated && !initializing) {
    return <ListPageAuthGate>{dict.general.notAuthenticated}</ListPageAuthGate>;
  }

  return (
    <>
      <ListPageToolbar align={showCreateAction ? 'between' : 'end'}>
        {showCreateAction ? (
          <DSButton
            variant="primary"
            data-testid="create-workspace-button"
            onPress={() => router.push(`/${locale}/workspace`)}
          >
            {dictWorkspaces.createAction}
          </DSButton>
        ) : null}
        <ListPageSearchField
          value={searchQuery}
          onChange={handleSearchChange}
          testIdPrefix="workspaces"
        />
      </ListPageToolbar>

      <DataTable<WorkspaceItem>
        data={paginatedWorkspaces}
        columns={columns}
        loading={loading || initializing}
        error={workspacesError ? dictWorkspaces.loadError : null}
        emptyMessage={dictWorkspaces.empty}
        loadingMessage={dict.general.loading}
        itemName="items"
        caption={dictWorkspaces.tableHeading}
        pageSize={pageSize}
        currentPage={effectivePage}
        totalItems={filteredWorkspaces.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
        pageSizeOptions={[5, 10, 25, 50]}
        keyExtractor={(workspace) => workspace.id}
      />
    </>
  );
}

export default WorkspaceList;
