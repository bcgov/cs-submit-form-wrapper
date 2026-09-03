'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSWRConfig } from 'swr';
import type { FormType } from '@formio/react';
import { getFormVersionSchema, getSobaForm, getSobaFormVersions } from '@/src/shared/api/sobaApi';
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import { sessionReadConfig } from '@/src/shared/api/swrConfig';
import type { SobaFormVersionType } from '@/src/types/forms';

const schemaKey = (versionId: string) => ['form-version-schema', versionId];

/**
 * What the designer is editing: the form, its versions, the selected version's schema, and the
 * unsaved edits layered over them. Edits are held apart from the loaded values so a revalidation
 * can never overwrite what the user has typed.
 */
export function useFormDraft(formId?: string) {
  const {
    data: form,
    mutate: refreshForm,
    error: formError,
  } = useAuthedSWR(
    formId ? ['design-form', formId] : null,
    (token) => getSobaForm(token, formId as string),
    sessionReadConfig,
  );

  const {
    data: versionsData,
    mutate: refreshVersions,
    error: versionsError,
  } = useAuthedSWR(
    formId ? ['design-form-versions', formId] : null,
    (token) => getSobaFormVersions(token, formId as string),
    sessionReadConfig,
  );

  const versions: SobaFormVersionType[] = useMemo(
    () => (Array.isArray(versionsData?.items) ? versionsData.items : []),
    [versionsData],
  );

  // The highest versionNo is the current one; a new draft becomes current as soon as it is listed.
  const currentVersion = useMemo(
    () =>
      versions.reduce<SobaFormVersionType | null>(
        (acc, v) => (!acc || v.versionNo > acc.versionNo ? v : acc),
        null,
      ),
    [versions],
  );

  const [selectedVersionId, setSelectedVersionId] = useState<string>('current');
  const isHistoryView = selectedVersionId !== 'current';
  const activeVersion = isHistoryView
    ? (versions.find((v) => v.id === selectedVersionId) ?? null)
    : currentVersion;

  const {
    data: loadedSchema,
    isLoading: schemaLoading,
    error: schemaError,
  } = useAuthedSWR(
    activeVersion?.id ? schemaKey(activeVersion.id) : null,
    (token) => getFormVersionSchema(token, activeVersion?.id as string),
    sessionReadConfig,
  );

  const { mutate: globalMutate } = useSWRConfig();

  /**
   * The schema just written to a version, as the new cached value. Without this a save drops back
   * to the pre-save body: the read never revalidates, so the next save or new version would post
   * the schema as it was before the edits.
   */
  const commitSchema = useCallback(
    (versionId: string, next: FormType) =>
      globalMutate(schemaKey(versionId), next, { revalidate: false }),
    [globalMutate],
  );

  const loadError = formError ?? versionsError ?? schemaError ?? null;

  const [editedSchema, setEditedSchema] = useState<FormType | null>(null);
  const [editedName, setEditedName] = useState<string | null>(null);

  const discardEdits = useCallback(() => {
    setEditedSchema(null);
    setEditedName(null);
  }, []);

  const selectVersion = useCallback(
    (versionId: string) => {
      if (versionId !== 'current' && !versions.some((v) => v.id === versionId)) return;
      setSelectedVersionId(versionId);
      discardEdits();
    },
    [versions, discardEdits],
  );

  return {
    form: form ?? null,
    versions,
    currentVersion,
    activeVersion,
    selectedVersionId,
    isHistoryView,
    historicalVersionNo: isHistoryView ? (activeVersion?.versionNo ?? null) : null,
    schema: editedSchema ?? (loadedSchema as FormType | undefined) ?? null,
    name: editedName ?? form?.name ?? '',
    description: form?.description ?? '',
    isDirty: editedSchema !== null || editedName !== null,
    // The draft is not assembled until the form and its versions have answered. A form whose
    // versions are still loading has no schema key yet, so schemaLoading alone reports ready.
    // A read that failed has answered: these reads do not revalidate on their own, so reporting
    // loading here would leave the designer on a spinner for the life of the page.
    loading:
      !!formId && !loadError && (form === undefined || versionsData === undefined || schemaLoading),
    error: loadError,
    setName: setEditedName,
    setSchema: setEditedSchema,
    discardEdits,
    commitSchema,
    selectVersion,
    refreshForm,
    refreshVersions,
  };
}
