'use client';

import { useMemo, useCallback } from 'react';
import { Button as DSButton } from '@bcgov/design-system-react-components';
import { DataTable, type Column } from '@/src/components/DataTable';
import { ListPageToolbar, ListPageAuthGate } from '@/src/components/ListPageLayout';
import { ListPageSearchField } from '@/src/components/ListPageSearchField';
import { RowActionButton } from '@/src/components/RowActionButton';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { useRouter, usePathname } from 'next/navigation';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { useWorkspaceList } from '@/src/shared/api/useWorkspaces';
import { loadErrorMessage } from '@/src/shared/api/loadErrorMessage';
import { useCurrentUser } from '@/src/shared/api/useCurrentUser';
import { WORKSPACES_LIST_QUERY } from '@/src/shared/list/listQueryMemory';
import { PAGE_SIZE_OPTIONS, useListQuery } from '@/src/shared/list/useListQuery';
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
  const { authenticated, initializing } = useKeycloak();

  const router = useRouter();
  const pathname = usePathname();

  const locale = getLocaleFromPath(pathname);

  const listQuery = useListQuery(WORKSPACES_LIST_QUERY);
  const {
    workspaces,
    total,
    isLoading: workspacesLoading,
    error: workspacesError,
  } = useWorkspaceList({
    offset: listQuery.offset,
    limit: listQuery.pageSize,
    sort: listQuery.sort,
    q: listQuery.q,
  });

  const error = useMemo(
    () =>
      workspacesError
        ? loadErrorMessage(workspacesError, {
            sessionExpired: dict.general.sessionExpired,
            noAccess: dict.general.noAccess,
            failed: dictWorkspaces.listLoadError,
          })
        : null,
    [
      workspacesError,
      dict.general.sessionExpired,
      dict.general.noAccess,
      dictWorkspaces.listLoadError,
    ],
  );
  const { data: currentUser } = useCurrentUser();

  const handleSelect = useCallback(
    (workspaceId: string, destination: 'forms' | 'manage') => {
      if (destination === 'forms') {
        // Opening a workspace's forms is an explicit scope choice, so it seeds the list filter.
        router.push(`/${locale}/forms?workspace=${encodeURIComponent(workspaceId)}`);
      } else {
        router.push(`/${locale}/workspace/${workspaceId}`);
      }
    },
    [router, locale],
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
        sortField: 'name',
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
          value={listQuery.searchInput}
          onChange={listQuery.setSearchInput}
          onSubmit={listQuery.commitSearch}
          testIdPrefix="workspaces"
        />
      </ListPageToolbar>

      <DataTable<WorkspaceItem>
        data={workspaces}
        columns={columns}
        loading={loading || initializing}
        error={error}
        emptyMessage={dictWorkspaces.empty}
        loadingMessage={dict.general.loading}
        itemName="items"
        caption={dictWorkspaces.tableHeading}
        pageSize={listQuery.pageSize}
        currentPage={listQuery.page}
        totalItems={total}
        onPageChange={listQuery.setPage}
        onPageSizeChange={listQuery.setPageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        sort={listQuery.sort}
        onSortChange={listQuery.setSort}
        keyExtractor={(workspace) => workspace.id}
      />
    </>
  );
}

export default WorkspaceList;
