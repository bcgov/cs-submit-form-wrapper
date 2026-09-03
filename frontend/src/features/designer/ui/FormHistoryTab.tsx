'use client';

import { useMemo, useState, useCallback } from 'react';
import { Link } from '@bcgov/design-system-react-components';

import type { Dictionary } from '@/src/types/plugins';
import { Tag, TagColor } from '@/src/components/Tag';
import { DataTable, type Column } from '@/src/components/DataTable';
import { useFormatLongDate } from '@/src/shared/hooks/useFormatLongDate';
import type { SobaFormVersionType } from '@/src/types/forms';
import { capitalizeFirstLetter } from '@/src/shared/util/stringUtils';

interface FormHistoryTabProps {
  dict: Dictionary;
  versions: SobaFormVersionType[];
  loading: boolean;
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
  versions,
  loading,
  onSelectVersion,
  onRestoreVersion,
  onNavigateToDesigner,
}: Readonly<FormHistoryTabProps>) {
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
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
        width: '10%',
      },
      {
        key: 'state',
        label: dict.form?.status || 'Status',
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

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  return (
    <DataTable<SobaFormVersionType>
      data={versions}
      columns={columns}
      loading={loading}
      emptyMessage={dict.form.emptyHistory}
      loadingMessage={dict.general.loading}
      itemName="items"
      caption={dict.general.forms}
      pageSize={pageSize}
      currentPage={currentPage}
      totalItems={versions.length}
      onPageChange={setCurrentPage}
      onPageSizeChange={handlePageSizeChange}
      pageSizeOptions={[5, 10, 25, 50]}
      keyExtractor={(version) => version.id}
    />
  );
}
