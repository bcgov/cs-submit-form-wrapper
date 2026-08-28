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

/** List forms (PG-backed) with each form's representative version, for the designer/submit list. */
export async function getSobaForms(
  token: string,
  workspaceId?: string,
): Promise<{ items: SobaFormSummary[] }> {
  const query = { limit: 100, workspaceId };
  const response = await sobaFetch('/design/forms', {
    token,
    query,
  });
  return parseJson(response);
}

export async function getSobaSubmissions(
  token: string,
  params?: Record<string, string | number | boolean>,
  workspaceId?: string,
): Promise<ListSubmissionsResponse> {
  const query: Record<string, string> = {};
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      query[key] = String(value);
    }
  }
  if (workspaceId) {
    query.workspaceId = workspaceId;
  }
  const response = await sobaFetch('/design/submissions', {
    token,
    query,
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

export async function getSobaFormVersions(
  token: string,
  formId: string,
): Promise<{ items: SobaFormVersionType[] }> {
  const response = await sobaFetch('/design/form-versions', {
    token,
    query: { formId, limit: 100 },
  });
  return parseJson(response);
}

/** Create a new (empty) form version draft for a form. */
export async function createFormVersion(
  token: string,
  formId: string,
): Promise<SobaFormVersionType> {
  const response = await sobaFetch('/design/form-versions', {
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
