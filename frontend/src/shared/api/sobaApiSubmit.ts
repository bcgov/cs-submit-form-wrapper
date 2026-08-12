// Submit-mode API service: public form read + submission create/save + confirmation read. All calls
// hit /submit/* and take an optional token — anonymous callers on a public-audience form are attributed
// to the seeded public user by the backend. Access is decided by the workspace Form submitters audience.
import { sobaFetch } from './sobaFetch';
import { parseJson } from './sobaHelpers';
import { FormType } from '@formio/react';
import type { SubmitFillBundle } from '../../types/forms';
import type { SubmissionResponse, SubmissionListItem } from '@/src/types/submissions';

/** The one payload the fill page needs: workflow state + schema + any saved answers (resume). */
export async function getSubmitFillBundle(
  token: string | undefined,
  submissionId: string,
): Promise<SubmitFillBundle> {
  const response = await sobaFetch(`/submit/submissions/${submissionId}/fill`, { token });
  return parseJson<SubmitFillBundle>(response);
}

/** A submission's own form-version schema, for its read-only confirmation view. */
export async function getSubmitSubmissionSchema(
  token: string | undefined,
  submissionId: string,
): Promise<FormType | null> {
  const response = await sobaFetch(`/submit/submissions/${submissionId}/schema`, { token });
  if (response.status === 404) return null;
  return parseJson(response);
}

/**
 * Open a SOBA submission (a PG row in the `opened` state); its answer data is written later via
 * saveSobaFormSubmission (draft) or submitSobaFormSubmission (submit). Token is optional: anonymous
 * submissions to a public-audience form are attributed to the public user.
 */
export async function openSobaFormSubmission(
  token: string | undefined,
  formId: string,
): Promise<SubmissionResponse> {
  const response = await sobaFetch('/submit/submissions', {
    token,
    method: 'POST',
    json: { formId },
  });
  return parseJson<SubmissionResponse>(response);
}

/**
 * Save a submission's answer data as a draft; the server writes a new engine document + revision.
 * Reserved for the (deferred) draft-save UI — the fill flow is resume-only for now, so nothing calls
 * this yet. Kept as the client half of POST /submit/submissions/:id/save.
 */
export async function saveSobaFormSubmission(
  token: string | undefined,
  submissionId: string,
  data: Record<string, unknown>,
): Promise<SubmissionResponse> {
  const response = await sobaFetch(`/submit/submissions/${submissionId}/save`, {
    token,
    method: 'POST',
    json: { data },
  });
  return parseJson<SubmissionResponse>(response);
}

/** Submit a submission's answer data; the server records the submit and marks it submitted. */
export async function submitSobaFormSubmission(
  token: string | undefined,
  submissionId: string,
  data: Record<string, unknown>,
): Promise<SubmissionResponse> {
  const response = await sobaFetch(`/submit/submissions/${submissionId}/submit`, {
    token,
    method: 'POST',
    json: { data },
  });
  return parseJson<SubmissionResponse>(response);
}

/** Read a submission's metadata for the confirmation view (audience-readable). */
export async function getSubmitSubmission(
  token: string | undefined,
  id: string,
): Promise<SubmissionListItem> {
  const response = await sobaFetch(`/submit/submissions/${id}`, { token });
  return parseJson(response);
}

/** Read a submission's answer document for the confirmation view (null if not yet provisioned). */
export async function getSubmitSubmissionData(
  token: string | undefined,
  id: string,
): Promise<{ data?: Record<string, unknown> } | null> {
  const response = await sobaFetch(`/submit/submissions/${id}/data`, { token });
  if (response.status === 404) return null;
  return parseJson(response);
}
