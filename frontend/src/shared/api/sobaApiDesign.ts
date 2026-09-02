// Design-mode API service: form authoring + submission management. All calls hit /design/* and
// require a staff token. Public form read/submit lives in sobaApiSubmit.
import { sobaFetch } from './sobaFetch';
import { parseJson } from './sobaHelpers';
import { FormType } from '@formio/react';
import type {
  SobaFormType,
  CreateSobaFormioFormResponse,
  SobaResponseFormType,
  SobaFormVersionType,
} from '../../types/forms';
import type { ListSubmissionsResponse, SubmissionListItem } from '@/src/types/submissions';
import { toListRequestQuery, type ListPage, type ListQueryArgs } from '@/src/types/list';

export async function createSobaFormioForm(
  token: string,
  data: SobaFormType,
  workspaceId?: string,
): Promise<CreateSobaFormioFormResponse> {
  data.formEngineCode = 'formio-v5';

  if (workspaceId) {
    data.workspaceId = workspaceId;
  }

  const response = await sobaFetch('/design/forms', {
    token,
    method: 'POST',
    json: data,
  });
  return parseJson(response);
}

export async function updateSobaForm(
  token: string,
  id: string,
  data: Partial<SobaFormType>,
): Promise<SobaResponseFormType> {
  const response = await sobaFetch(`/design/forms/${id}`, {
    token,
    method: 'PATCH',
    json: data,
  });
  return parseJson(response);
}

/**
 * POST a Form.io schema to the server to normalize it into a clean, portable, builder-ready
 * form definition. Used both for import (file upload) and export (download).
 */
export async function normalizeFormSchema(
  token: string,
  schema: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await sobaFetch('/design/forms/normalize', {
    token,
    method: 'POST',
    json: { schema },
  });
  const data = await parseJson<{ schema: Record<string, unknown> }>(response);
  return data.schema;
}

export async function publishSobaFormVersion(token: string, id: string) {
  const response = await sobaFetch(`/design/form-versions/${id}/publish`, {
    token,
    method: 'POST',
  });
  return parseJson(response);
}

export async function getSobaForm(token: string, id: string): Promise<SobaResponseFormType> {
  const response = await sobaFetch(`/design/forms/${id}`, { token });
  return parseJson(response);
}

/** Compact form row for the designer/submit list. */
export type SobaFormSummary = {
  id: string;
  workspaceId: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type ListFormsResponse = {
  items: SobaFormSummary[];
  page: ListPage;
};

/** One page of forms. Search, sort and paging are resolved by the server. */
export async function getSobaForms(
  token: string,
  args: ListQueryArgs & { workspaceId?: string },
): Promise<ListFormsResponse> {
  const response = await sobaFetch('/design/forms', {
    token,
    query: { ...toListRequestQuery(args), workspaceId: args.workspaceId },
  });
  return parseJson(response);
}

/** One page of submissions. Search, sort and paging are resolved by the server. */
export async function getSobaSubmissions(
  token: string,
  args: ListQueryArgs & { formId?: string; workspaceId?: string; workflowState?: string },
): Promise<ListSubmissionsResponse> {
  const response = await sobaFetch('/design/submissions', {
    token,
    query: {
      ...toListRequestQuery(args),
      formId: args.formId,
      workspaceId: args.workspaceId,
      workflowState: args.workflowState,
    },
  });
  return parseJson(response);
}

/** Staff read of a single submission's metadata (management/review). */
export async function getSobaSubmission(token: string, id: string): Promise<SubmissionListItem> {
  const response = await sobaFetch(`/design/submissions/${id}`, { token });
  return parseJson(response);
}

/** Staff read of a submission's answer document (null if not yet provisioned). */
export async function getSobaSubmissionData(
  token: string,
  id: string,
): Promise<{ data?: Record<string, unknown> } | null> {
  const response = await sobaFetch(`/design/submissions/${id}/data`, { token });
  if (response.status === 404) return null;
  return parseJson(response);
}

/**
 * Every version of one form, newest first. A version picker, not a paged list: it asks for the
 * endpoint's maximum in one request, and `page.total` is how a caller sees that a form has more
 * versions than the picker is showing.
 */
export const FORM_VERSION_PICKER_LIMIT = 100;

const FORM_VERSIONS_PATH = '/design/form-versions';

export async function getSobaFormVersions(
  token: string,
  formId: string,
): Promise<{ items: SobaFormVersionType[]; page: ListPage }> {
  const response = await sobaFetch(FORM_VERSIONS_PATH, {
    token,
    query: { formId, limit: FORM_VERSION_PICKER_LIMIT, sort: 'versionNo:desc' },
  });
  return parseJson(response);
}

/** One version, by id. */
export async function getSobaFormVersion(
  token: string,
  id: string,
): Promise<SobaFormVersionType> {
  const response = await sobaFetch(`${FORM_VERSIONS_PATH}/${id}`, { token });
  return parseJson(response);
}

/** One page of a form's versions, for the history table. */
export async function getSobaFormVersionPage(
  token: string,
  args: ListQueryArgs & { formId: string },
): Promise<{ items: SobaFormVersionType[]; page: ListPage }> {
  const response = await sobaFetch(FORM_VERSIONS_PATH, {
    token,
    query: { formId: args.formId, ...toListRequestQuery(args) },
  });
  return parseJson(response);
}

/** Create a new (empty) form version draft for a form. */
export async function createFormVersion(
  token: string,
  formId: string,
): Promise<SobaFormVersionType> {
  const response = await sobaFetch(FORM_VERSIONS_PATH, {
    token,
    method: 'POST',
    json: { formId },
  });
  return parseJson(response);
}

/** Save a form version's schema; the server provisions it in the engine (Form.io). */
export async function saveFormVersionSchema(
  token: string,
  id: string,
  schema: FormType,
): Promise<SobaFormVersionType> {
  const response = await sobaFetch(`/design/form-versions/${id}/schema`, {
    token,
    method: 'POST',
    json: { schema },
  });
  return parseJson(response);
}

/** Read a form version's schema back from the engine (null if not yet provisioned). */
export async function getFormVersionSchema(token: string, id: string): Promise<FormType | null> {
  const response = await sobaFetch(`/design/form-versions/${id}/schema`, { token });
  if (response.status === 404) return null;
  return parseJson(response);
}

/**
 * A 404 means the submission was already gone, which is the outcome the caller asked for. Reporting
 * it as a failure would contradict the refreshed list.
 */
export async function deleteSobaSubmission(token: string, id: string): Promise<void> {
  const response = await sobaFetch(`/design/submissions/${id}`, { token, method: 'DELETE' });
  if (!response.ok && response.status !== 404) await parseJson(response);
}
