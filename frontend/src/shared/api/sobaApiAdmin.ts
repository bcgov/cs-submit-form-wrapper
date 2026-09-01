import { parseJson } from './sobaHelpers';
import { sobaFetch } from './sobaFetch';

import type {
  DocumentGenerationAuditsQuery,
  DocumentGenerationAuditsResponse,
  FeatureScopeItem,
  FeatureScopesResponse,
  SobaAdminsResponse,
  UpsertFeatureScopeBody,
} from '../../types/admin';

/**
 * Platform administration (`/admin/*`). Every route is guarded by `requireSobaAdmin` on the
 * backend, so a non-admin caller gets a 403 regardless of what the UI renders.
 */

export async function fetchSobaAdmins(
  token: string,
  params: { limit?: number; cursor?: string } = {},
): Promise<SobaAdminsResponse> {
  const response = await sobaFetch('/admin/soba-admins', {
    token,
    query: { limit: params.limit, cursor: params.cursor },
  });
  return parseJson(response);
}

export async function addSobaAdmin(token: string, userId: string): Promise<void> {
  const response = await sobaFetch('/admin/soba-admins', {
    token,
    method: 'POST',
    json: { userId },
  });
  if (!response.ok) await parseJson(response);
}

/**
 * A 404 means the row was already gone, which is the outcome the caller asked for. Reporting it as
 * a failure would contradict the refreshed list.
 */
async function deleteResource(token: string, path: string): Promise<void> {
  const response = await sobaFetch(path, { token, method: 'DELETE' });
  if (!response.ok && response.status !== 404) await parseJson(response);
}

export async function removeSobaAdmin(token: string, userId: string): Promise<void> {
  await deleteResource(token, `/admin/soba-admins/${userId}`);
}

export async function fetchFeatureScopes(
  token: string,
  params: { featureCode?: string; scopeType?: string; status?: string; limit?: number } = {},
): Promise<FeatureScopesResponse> {
  const response = await sobaFetch('/admin/feature-scopes', {
    token,
    query: {
      featureCode: params.featureCode,
      scopeType: params.scopeType,
      status: params.status,
      limit: params.limit,
    },
  });
  return parseJson(response);
}

export async function fetchFeatureScope(token: string, id: string): Promise<FeatureScopeItem> {
  const response = await sobaFetch(`/admin/feature-scopes/${id}`, { token });
  return parseJson(response);
}

export async function removeFeatureScope(token: string, id: string): Promise<void> {
  await deleteResource(token, `/admin/feature-scopes/${id}`);
}

/** Grants (or revokes, with `status: 'inactive'`) a scoped feature for a workspace or form. */
export async function upsertFeatureScope(
  token: string,
  body: UpsertFeatureScopeBody,
): Promise<void> {
  const response = await sobaFetch('/admin/feature-scopes', {
    token,
    method: 'POST',
    json: body,
  });
  if (!response.ok) await parseJson(response);
}

export async function fetchDocumentGenerationAudits(
  token: string,
  query: DocumentGenerationAuditsQuery,
): Promise<DocumentGenerationAuditsResponse> {
  const response = await sobaFetch('/admin/document-generation/audits', {
    token,
    query: { workspaceId: query.workspaceId, formId: query.formId, limit: query.limit },
  });
  return parseJson(response);
}
