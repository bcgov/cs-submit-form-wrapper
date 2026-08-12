import {
  SubmissionCursorMode,
  SubmissionListSort,
  appendSubmissionRevision,
  openSubmission,
  getSubmissionById,
  getSubmissionRecordById,
  listSubmissionsForWorkspace,
  markSubmissionDeleted,
  updateSubmissionDraft,
  type SubmissionRecord,
} from '../db/repos/submissionRepo';
import { getFormVersionById, getPublishedVersionForForm } from '../db/repos/formVersionRepo';
import { getFormEngineCodeForForm } from '../db/repos/formRepo';
import { createFormEngineAdapter } from '../integrations/form-engine/FormEngineRegistry';
import { NotFoundError, ValidationError } from '../errors';
import { SubmissionEventType, type SubmissionEventTypeCode } from '../db/codes';
import { resolveSubmissionTransition } from './submissionLifecycle';

interface CreateInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
  formId: string;
}

interface SaveInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
  submissionId: string;
  data: Record<string, unknown>;
}

interface DeleteInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
  submissionId: string;
}

interface ListInput {
  workspaceIds: string[];
  actorId: string;
  limit: number;
  formId?: string;
  formVersionId?: string;
  submissionId?: string;
  workflowState?: string;
  createdBy?: string;
  sort: SubmissionListSort;
  cursorMode: SubmissionCursorMode;
  afterId?: string;
  afterUpdatedAt?: Date;
}

export class SubmissionService {
  /** Open a new submission against the form's currently published version (the only submittable one). */
  async open(input: CreateInput) {
    const version = await getPublishedVersionForForm(input.workspaceId, input.formId);
    if (!version) throw new NotFoundError('Form has no published version');
    return openSubmission({ ...input, formVersionId: version.id });
  }

  /** Save the current answer data as a draft (opened → draft; draft stays draft). */
  async save(input: SaveInput) {
    return this.record(input, SubmissionEventType.saved);
  }

  /** Submit the answer data (opened/draft → submitted). */
  async submit(input: SaveInput) {
    return this.record(input, SubmissionEventType.submitted);
  }

  /**
   * Record a save/submit: gate the transition (lifecycle policy) up front, create a new (immutable)
   * submission document in the form engine, then advance the PG submission + append a revision
   * capturing the before→after engine refs. Mirrors the forms provisioning flow — status
   * 'provisioning' → 'ready' (in appendSubmissionRevision) or 'error'.
   */
  private async record(input: SaveInput, eventType: SubmissionEventTypeCode) {
    const submission = await getSubmissionRecordById(input.workspaceId, input.submissionId);
    if (!submission) throw new NotFoundError('Submission not found');

    // Decide the resulting state first, so a terminal submission is rejected (409) before any write.
    const workflowState = resolveSubmissionTransition(submission.workflowState, eventType);

    const version = await getFormVersionById(input.workspaceId, submission.formVersionId);
    if (!version || !version.engineSchemaRef) {
      throw new ValidationError('Form version is not provisioned in the engine');
    }

    const engineCode = await getFormEngineCodeForForm(input.workspaceId, submission.formId);
    if (!engineCode) {
      throw new ValidationError('Form has no form engine configured');
    }

    const adapter = createFormEngineAdapter(engineCode);
    if (typeof adapter.createSubmission !== 'function') {
      throw new ValidationError(`Form engine '${engineCode}' does not support submissions`);
    }

    await updateSubmissionDraft(input.workspaceId, input.submissionId, input.actorDisplayLabel, {
      engineSyncStatus: 'provisioning',
      engineSyncError: null,
    });

    try {
      const { engineRef } = await adapter.createSubmission({
        engineFormRef: version.engineSchemaRef,
        submissionId: input.submissionId,
        revisionNo: submission.currentRevisionNo + 1,
        workspaceId: input.workspaceId,
        data: input.data,
      });

      const updated = await appendSubmissionRevision({
        workspaceId: input.workspaceId,
        submissionId: input.submissionId,
        actorId: input.actorId,
        actorDisplayLabel: input.actorDisplayLabel,
        eventType,
        workflowState,
        afterEngineSubmissionRef: engineRef,
      });

      if (!updated) throw new NotFoundError('Submission not found');

      return updated;
    } catch (err) {
      await updateSubmissionDraft(input.workspaceId, input.submissionId, input.actorDisplayLabel, {
        engineSyncStatus: 'error',
        engineSyncError: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async delete(input: DeleteInput) {
    return markSubmissionDeleted(input.workspaceId, input.submissionId, input.actorDisplayLabel);
  }

  async get(workspaceId: string, submissionId: string) {
    return getSubmissionById(workspaceId, submissionId);
  }

  /**
   * Reads the submission's current answer document back from the form engine (null if unprovisioned).
   * Pass `record` to reuse an already-loaded submission row instead of re-fetching it.
   */
  async getContent(input: {
    workspaceId: string;
    submissionId: string;
    record?: SubmissionRecord;
  }) {
    const submission =
      input.record ?? (await getSubmissionRecordById(input.workspaceId, input.submissionId));
    if (!submission || !submission.engineSubmissionRef) return null;

    const version = await getFormVersionById(input.workspaceId, submission.formVersionId);
    if (!version || !version.engineSchemaRef) return null;

    const engineCode = await getFormEngineCodeForForm(input.workspaceId, submission.formId);
    if (!engineCode) return null;

    const adapter = createFormEngineAdapter(engineCode);
    if (typeof adapter.readSubmission !== 'function') return null;

    return adapter.readSubmission(version.engineSchemaRef, submission.engineSubmissionRef);
  }

  async list(input: ListInput) {
    return listSubmissionsForWorkspace({
      ...input,
    });
  }
}
