'use client';

import { useMemo } from 'react';
import { getSobaSubmissions } from '@/src/shared/api/sobaApi';
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import { listReadConfig } from '@/src/shared/api/swrConfig';
import type { ListQueryArgs } from '@/src/types/list';
import type { SubmissionListItem } from '@/src/types/submissions';

const EMPTY: SubmissionListItem[] = [];

/**
 * One page of submissions for one form, read once its tab has been opened. The endpoint requires
 * submission_read, which a designer need not hold, so the read waits to be asked for.
 */
export function useFormSubmissions(
  formId: string | undefined,
  opened: boolean,
  query: ListQueryArgs,
) {
  const { data, isLoading, error, mutate } = useAuthedSWR(
    formId && opened
      ? ['form-submissions', formId, query.offset, query.limit, query.sort, query.q ?? '']
      : null,
    (token) =>
      getSobaSubmissions(token, {
        offset: query.offset,
        limit: query.limit,
        sort: query.sort,
        q: query.q,
        formId: formId as string,
      }),
    listReadConfig,
  );

  const submissions: SubmissionListItem[] = useMemo(
    () => (Array.isArray(data?.items) ? data.items : EMPTY),
    [data],
  );

  return { submissions, total: data?.page?.total, isLoading, error, refresh: mutate };
}
