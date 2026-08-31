import type { FeaturesMetaPayload } from '@/src/shared/config/featuresMeta';
import { isFeaturesMetaPayload } from '@/src/shared/config/featuresMeta';
import { getSobaApiBaseUrl } from '../config/runtimeConfig';
import { parseJson } from './sobaHelpers';
import { sobaFetch } from './sobaFetch';

import type { SobaFormType } from '../../types/forms';
import type {
  WorkspaceItem,
  WorkspacesResponse,
  CreateWorkspaceBody,
  UpdateWorkspaceBody,
} from '../../types/workspaces';
import type { CurrentUserResponse, PatchCurrentUserBody } from '../../types/user';

export type { SobaFormType, WorkspaceItem, WorkspacesResponse, CurrentUserResponse };
// Design-mode (staff, /design/*)
export {
  createSobaFormioForm,
  normalizeFormSchema,
  publishSobaFormVersion,
  getSobaForm,
  getSobaForms,
  getSobaSubmissions,
  getSobaSubmission,
  getSobaSubmissionData,
  getSobaFormVersions,
  createFormVersion,
  saveFormVersionSchema,
  getFormVersionSchema,
  updateSobaForm,
  deleteSobaSubmission,
} from './sobaApiDesign';
// Submit-mode (public-capable, /submit/*)
export {
  getSubmitFillBundle,
  getSubmitSubmissionSchema,
  openSobaFormSubmission,
  saveSobaFormSubmission,
  submitSobaFormSubmission,
  getSubmitSubmission,
  getSubmitSubmissionData,
  deleteSubmitSubmission,
} from './sobaApiSubmit';

export type BuildMeta = {
  name: string;
  version: string;
  nodeVersion: string;
  gitSha: string;
  gitTag: string;
  imageTag: string;
};

export async function fetchHealth(): Promise<{ status: string }> {
  const response = await fetch(`${getSobaApiBaseUrl()}/health`, {
    method: 'GET',
    cache: 'no-store',
  });
  return parseJson(response);
}

export async function fetchBuildMeta(): Promise<BuildMeta> {
  const response = await fetch(`${getSobaApiBaseUrl()}/meta/build`, {
    method: 'GET',
    cache: 'no-store',
  });
  return parseJson(response);
}

export async function fetchFeaturesMeta(): Promise<FeaturesMetaPayload> {
  const response = await fetch(`${getSobaApiBaseUrl()}/meta/features`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });
  const payload = await parseJson<unknown>(response);
  if (!isFeaturesMetaPayload(payload)) {
    throw new Error('Invalid features meta response');
  }
  return payload;
}

/** Readiness may return 503 with a JSON body; callers should not use `parseJson` alone. */
export async function fetchHealthReady(): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${getSobaApiBaseUrl()}/health/ready`, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const body = (await response.json()) as unknown;
  return { status: response.status, body };
}

export async function fetchPluginsMeta(): Promise<unknown> {
  const response = await fetch(`${getSobaApiBaseUrl()}/meta/plugins`, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

export async function fetchFormEnginesMeta(): Promise<unknown> {
  const response = await fetch(`${getSobaApiBaseUrl()}/meta/form-engines`, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

export async function fetchFrontendConfigMeta(): Promise<unknown> {
  const response = await fetch(`${getSobaApiBaseUrl()}/meta/frontend-config`, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

export async function fetchCodesMeta(onlyEnabledFeatures = true): Promise<unknown> {
  const q = onlyEnabledFeatures ? '?only_enabled_features=true' : '';
  const response = await fetch(`${getSobaApiBaseUrl()}/meta/codes${q}`, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

export async function fetchRolesMeta(onlyEnabledFeatures = true): Promise<unknown> {
  const q = onlyEnabledFeatures ? '?only_enabled_features=true' : '';
  const response = await fetch(`${getSobaApiBaseUrl()}/meta/roles${q}`, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

export async function fetchWorkspaces(
  token: string,
  requiredPermission?: string,
): Promise<WorkspacesResponse> {
  const query = requiredPermission ? { requiredPermission } : undefined;
  const response = await sobaFetch('/workspaces', { token, query });
  return parseJson(response);
}

export async function selectWorkspace(token: string, id: string): Promise<WorkspaceItem> {
  const response = await sobaFetch(`/workspaces/${id}`, { token });
  const workspace = await parseJson<WorkspaceItem>(response);
  return workspace;
}

export async function fetchCurrentUser(token: string): Promise<CurrentUserResponse> {
  const response = await sobaFetch('/me', { token });
  return parseJson(response);
}

export async function patchCurrentUser(
  token: string,
  body: PatchCurrentUserBody,
): Promise<CurrentUserResponse> {
  const response = await sobaFetch('/me', { token, method: 'PATCH', json: body });
  return parseJson(response);
}

export async function createWorkspace(
  token: string,
  body: CreateWorkspaceBody,
): Promise<WorkspaceItem> {
  const response = await sobaFetch('/workspaces', { token, method: 'POST', json: body });
  return parseJson(response);
}

export async function updateWorkspace(
  token: string,
  id: string,
  body: UpdateWorkspaceBody,
): Promise<WorkspaceItem> {
  const response = await sobaFetch(`/workspaces/${id}`, { token, method: 'PATCH', json: body });
  return parseJson(response);
}
