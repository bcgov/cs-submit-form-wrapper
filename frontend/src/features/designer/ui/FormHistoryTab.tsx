'use client';

import { useMemo, useCallback } from 'react';
import { Link } from '@bcgov/design-system-react-components';

import type { Dictionary } from '@/src/types/plugins';
import { Tag, TagColor } from '@/src/components/Tag';
import { DataTable, type Column } from '@/src/components/DataTable';
import { useFormatLongDate } from '@/src/shared/hooks/useFormatLongDate';
import { FORM_VERSIONS_LIST_QUERY } from '@/src/shared/list/listQueryMemory';
import { PAGE_SIZE_OPTIONS, useListQuery } from '@/src/shared/list/useListQuery';
import { useFormVersionPage } from '../useFormVersions';
import type { SobaFormVersionType } from '@/src/types/forms';
import { capitalizeFirstLetter } from '@/src/shared/util/stringUtils';

interface FormHistoryTabProps {
  dict: Dictionary;
  formId?: string;
  onSelectVersion: (versionId: string) => void;
  onRestoreVersion: (version: SobaFormVersionType) => Promise<void>;
  onNavigateToDesigner?: () => void;
}

function stateToColour(state: string): TagColor {
  if (state === 'published') return 'green';
  return 'grey';
}

export default function FormHistoryTab({
  dict,
  formId,
  onSelectVersion,
  onRestoreVersion,
  onNavigateToDesigner,
}: Readonly<FormHistoryTabProps>) {
  const listQuery = useListQuery(FORM_VERSIONS_LIST_QUERY);
  const { versions, total, isLoading } = useFormVersionPage(formId, {
    offset: listQuery.offset,
    limit: listQuery.pageSize,
    sort: listQuery.sort,
  });
  const formatLongDate = useFormatLongDate();

  const openInDesigner = useCallback(
    (version: SobaFormVersionType) => {
      onSelectVersion(version.id);
      onNavigateToDesigner?.();
    },
    [onSelectVersion, onNavigateToDesigner],
  );

  const restore = useCallback(
    (version: SobaFormVersionType) => {
      void onRestoreVersion(version).then(() => onNavigateToDesigner?.());
    },
    [onRestoreVersion, onNavigateToDesigner],
  );

  const columns: Column<SobaFormVersionType>[] = useMemo(
    () => [
      {
        key: 'versionNo',
        label: dict?.general?.version || 'Version',
        sortField: 'versionNo',
        width: '10%',
      },
      {
        key: 'state',
        label: dict.form?.status || 'Status',
        sortField: 'state',
        render: (version: SobaFormVersionType) => (
          <Tag
            data-testid={`${version.id}-status-tag`}
            text={capitalizeFirstLetter(version.state)}
            color={stateToColour(version.state)}
          />
        ),
      },
      {
        key: 'createdBy',
        label: dict.submission?.formList?.columns?.createdBy || 'Created By',
      },
      {
        key: 'created',
        label: dict.submission?.formList?.columns?.createdAt || 'Created Date',
        sortField: 'createdAt',
        render: (version: SobaFormVersionType) => (
          <span className="small" data-testid={`${version.id}-created-date`}>
            {formatLongDate(version.createdAt)}
          </span>
        ),
      },
      {
        key: 'actions',
        label: dict.submission?.formList?.columns?.quickLinks || 'Quick Links',
        align: 'start',
        width: '10%',
        render: (version: SobaFormVersionType) => (
          <>
            <Link
              className="bcds-react-aria-Link medium false me-2"
              data-testid={`${version.id}-design-link`}
              onPress={() => openInDesigner(version)}
            >
              {dict.header.design}
            </Link>
            <Link
              className="bcds-react-aria-Link medium false me-2"
              data-testid={`${version.id}-newVersionFrom-link`}
              onPress={() => restore(version)}
            >
              {dict.form.newVersionFrom}
            </Link>
          </>
        ),
      },
    ],
    [dict, formatLongDate, openInDesigner, restore],
  );

  return (
    <DataTable<SobaFormVersionType>
      data={versions}
      columns={columns}
      loading={isLoading}
      emptyMessage={dict.form.emptyHistory}
      loadingMessage={dict.general.loading}
      itemName="items"
      caption={dict.general.forms}
      pageSize={listQuery.pageSize}
      currentPage={listQuery.page}
      totalItems={total}
      onPageChange={listQuery.setPage}
      onPageSizeChange={listQuery.setPageSize}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      sort={listQuery.sort}
      onSortChange={listQuery.setSort}
      keyExtractor={(version) => version.id}
    />
  );
}
