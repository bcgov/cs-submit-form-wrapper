'use client';

import { useMemo } from 'react';
import { getSobaSubmissions } from '@/src/shared/api/sobaApi';
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import type { SubmissionListItem } from '@/src/types/submissions';

/**
 * Submissions for one form, read once its tab has been opened. The endpoint requires
 * submission_read, which a designer need not hold, so the read waits to be asked for.
 */
export function useFormSubmissions(formId: string | undefined, opened: boolean) {
  const { data, isLoading, error, mutate } = useAuthedSWR(
    formId && opened ? ['form-submissions', formId] : null,
    (token) => getSobaSubmissions(token, { formId: formId as string }),
  );

  const submissions: SubmissionListItem[] = useMemo(
    () => (Array.isArray(data?.items) ? data.items : []),
    [data],
  );

  return { submissions, isLoading, error, refresh: mutate };
}
