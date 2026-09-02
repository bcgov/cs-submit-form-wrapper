'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSWRConfig } from 'swr';
import type { FormType } from '@formio/react';
import {
  getFormVersionSchema,
  getSobaForm,
  getSobaFormVersion,
  getSobaFormVersions,
} from '@/src/shared/api/sobaApi';
import { useAuthedSWR } from '@/src/shared/api/useAuthedSWR';
import { sessionReadConfig } from '@/src/shared/api/swrConfig';
import type { SobaFormVersionType } from '@/src/types/forms';
import { versionsKey } from './useFormVersions';

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

  // The picker's list. The history table reads its own page under a key sharing this prefix.
  const { data: versionsData, error: versionsError } = useAuthedSWR(
    formId ? [...versionsKey(formId), 'picker'] : null,
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

  // Read by id, so a version the history table pages to but the picker does not carry still opens.
  const { data: selectedVersion, error: selectedVersionError } = useAuthedSWR(
    isHistoryView ? ['design-form-version', selectedVersionId] : null,
    (token) => getSobaFormVersion(token, selectedVersionId),
    sessionReadConfig,
  );

  const activeVersion = isHistoryView ? (selectedVersion ?? null) : currentVersion;

  // Keyed on the id itself rather than the version row it names, so the schema and the row load
  // together instead of one after the other.
  const activeVersionId = isHistoryView ? selectedVersionId : currentVersion?.id;
  const {
    data: loadedSchema,
    isLoading: schemaLoading,
    error: schemaError,
  } = useAuthedSWR(
    activeVersionId ? schemaKey(activeVersionId) : null,
    (token) => getFormVersionSchema(token, activeVersionId as string),
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

  const loadError = formError ?? versionsError ?? selectedVersionError ?? schemaError ?? null;

  const [editedSchema, setEditedSchema] = useState<FormType | null>(null);
  const [editedName, setEditedName] = useState<string | null>(null);

  const discardEdits = useCallback(() => {
    setEditedSchema(null);
    setEditedName(null);
  }, []);

  const selectVersion = useCallback(
    (versionId: string) => {
      setSelectedVersionId(versionId);
      discardEdits();
    },
    [discardEdits],
  );

  /** Every read of this form's versions: the picker's list and whichever page the table holds. */
  const refreshVersions = useCallback(
    () =>
      globalMutate(
        (key) => Array.isArray(key) && key[0] === 'design-form-versions' && key[1] === formId,
      ),
    [globalMutate, formId],
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
      !!formId &&
      !loadError &&
      (form === undefined ||
        versionsData === undefined ||
        (isHistoryView && selectedVersion === undefined) ||
        schemaLoading),
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
