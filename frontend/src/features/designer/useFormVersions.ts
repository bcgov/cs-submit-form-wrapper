'use client';

import { useMemo } from 'react';
import { getSobaFormVersionPage } from '@/src/shared/api/sobaApi';
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import { listReadConfig } from '@/src/shared/api/swrConfig';
import type { ListQueryArgs } from '@/src/types/list';
import type { SobaFormVersionType } from '@/src/types/forms';

const EMPTY: SobaFormVersionType[] = [];

/** The key every read of a form's versions shares, so one refresh reaches all of them. */
export const versionsKey = (formId: string) => ['design-form-versions', formId];

/** One page of a form's versions, for the history table. */
export function useFormVersionPage(formId: string | undefined, query: ListQueryArgs) {
  const { data, isLoading, error } = useAuthedSWR(
    formId ? [...versionsKey(formId), query.offset, query.limit, query.sort] : null,
    (token) =>
      getSobaFormVersionPage(token, {
        formId: formId as string,
        offset: query.offset,
        limit: query.limit,
        sort: query.sort,
      }),
    listReadConfig,
  );

  const versions: SobaFormVersionType[] = useMemo(
    () => (Array.isArray(data?.items) ? data.items : EMPTY),
    [data],
  );

  return { versions, total: data?.page?.total, isLoading, error };
}
