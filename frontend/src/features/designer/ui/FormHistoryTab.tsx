'use client';

import { useMemo, useState, useCallback } from 'react';
import { Link } from '@bcgov/design-system-react-components';
import type { FormType } from '@formio/react';

import type { Dictionary } from '@/src/types/plugins';
import { Tag, TagColor } from '@/src/components/Tag';
import { DataTable, type Column } from '@/src/components/DataTable';
import { useAppSelector, useAppDispatch } from '@/lib/store';
import { useFormatLongDate } from '@/src/shared/hooks/useFormatLongDate';
import type { SobaFormVersionType } from '@/src/types/forms';
import { loadVersionSchemaThunk, createNewVersionThunk } from '@/lib/slices/formSlice';
import { capitalizeFirstLetter } from '@/src/shared/util/stringUtils';
import { useKeycloak } from '@/lib/hooks/useKeycloak';

interface FormHistoryTabProps {
  dict: Dictionary;
  onNavigateToDesigner?: () => void;
}

function stateToColour(state: string): TagColor {
  if (state === 'published') return 'green';
  return 'grey';
}

export default function FormHistoryTab({ dict, onNavigateToDesigner }: FormHistoryTabProps) {
  const { versions, formId, loading } = useAppSelector((state) => state.form);
  const dispatch = useAppDispatch();
  const { token } = useKeycloak();
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const formatLongDate = useFormatLongDate();

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
          <Tag text={capitalizeFirstLetter(version.state)} color={stateToColour(version.state)} />
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
          <span className="small">{formatLongDate(version.createdAt)}</span>
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
              onPress={() => {
                if (!token) return;
                dispatch(loadVersionSchemaThunk({ token, version })).then(() => {
                  if (onNavigateToDesigner) onNavigateToDesigner();
                });
              }}
            >
              Design
            </Link>
            <Link
              className="bcds-react-aria-Link medium false me-2"
              onPress={() => {
                if (!token || !formId) return;
                dispatch(loadVersionSchemaThunk({ token, version })).then((actionResult) => {
                  const payload = actionResult.payload as { schema: FormType | null };
                  if (payload?.schema) {
                    dispatch(
                      createNewVersionThunk({ token, formId, formSchema: payload.schema }),
                    ).then(() => {
                      if (onNavigateToDesigner) onNavigateToDesigner();
                    });
                  }
                });
              }}
            >
              New Version From
            </Link>
          </>
        ),
      },
    ],
    [dict, formatLongDate, dispatch, token, formId, onNavigateToDesigner],
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  return (
    <>
      <DataTable<SobaFormVersionType>
        data={versions}
        columns={columns}
        loading={loading}
        error=""
        emptyMessage="No forms found matching your criteria."
        loadingMessage={dict.general.loading}
        itemName="items"
        caption={dict.general.forms}
        pageSize={pageSize}
        currentPage={currentPage}
        totalItems={columns.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
        pageSizeOptions={[5, 10, 25, 50]}
        keyExtractor={(version) => version.id}
      />
    </>
  );
}
