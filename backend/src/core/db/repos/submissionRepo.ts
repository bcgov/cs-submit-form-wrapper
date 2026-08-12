import { and, desc, eq, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { db } from '../client';
import { submissionRevisions, submissions, forms, formVersions } from '../schema';
import {
  SubmissionEventType,
  SubmissionWorkflowState,
  type SubmissionEventTypeCode,
  type SubmissionWorkflowStateCode,
} from '../codes';

export type SubmissionRecord = typeof submissions.$inferSelect;

export interface SubmissionListRow {
  id: string;
  formId: string;
  form: { name: string | null };
  formVersionId: string;
  formVersion: { versionNo: number | null };
  workflowState: string;
  engineSyncStatus: string;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionDetailRow extends SubmissionListRow {
  currentRevisionNo: number;
}

interface CreateSubmissionInput {
  workspaceId: string;
  formId: string;
  formVersionId: string;
  actorId: string;
  actorDisplayLabel: string | null;
}

interface SaveSubmissionInput {
  workspaceId: string;
  submissionId: string;
  actorId: string;
  actorDisplayLabel: string | null;
  eventType: SubmissionEventTypeCode;
  /** Target workflow state for this event, decided by the lifecycle policy (see submissionLifecycle). */
  workflowState: SubmissionWorkflowStateCode;
  /** Engine ref of the newly-created submission document for this revision (the "after" ref). */
  afterEngineSubmissionRef: string;
}

export type SubmissionListSort = 'id:desc' | 'updatedAt:desc';
export type SubmissionCursorMode = 'id' | 'ts_id';

export interface ListSubmissionsInput {
  /** Workspace resolved from the list scope anchor. */
  workspaceIds: string[];
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

/**
 * Open a submission: insert the row in the `opened` state and its revision-0 `opened` event in one
 * transaction, so every submission has a full history from the moment a fill begins. `submittedBy`
 * captures the actor who started it (the seeded public user for anonymous fills).
 */
export const openSubmission = async (input: CreateSubmissionInput) => {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(submissions)
      .values({
        workspaceId: input.workspaceId,
        formId: input.formId,
        formVersionId: input.formVersionId,
        workflowState: SubmissionWorkflowState.opened,
        submittedBy: input.actorId,
        engineSyncStatus: 'pending',
        currentRevisionNo: 0,
        createdBy: input.actorDisplayLabel,
        updatedBy: input.actorDisplayLabel,
      })
      .returning();

    await tx.insert(submissionRevisions).values({
      workspaceId: input.workspaceId,
      submissionId: created.id,
      revisionNo: 0,
      eventType: SubmissionEventType.opened,
      beforeEngineSubmissionRef: null,
      afterEngineSubmissionRef: null,
      changedBy: input.actorId,
    });

    return created;
  });
};

/** Fetch the raw (non-deleted) submission row — used by the engine write path. */
export const getSubmissionRecordById = async (
  workspaceId: string,
  submissionId: string,
): Promise<SubmissionRecord | null> => {
  const rows = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.workspaceId, workspaceId),
        eq(submissions.id, submissionId),
        isNull(submissions.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
};

export const getSubmissionById = async (
  workspaceId: string,
  submissionId: string,
): Promise<SubmissionDetailRow | null> => {
  const row = await db
    .select({
      id: submissions.id,
      formId: submissions.formId,
      form: { name: forms.name },
      formVersionId: submissions.formVersionId,
      formVersion: { versionNo: formVersions.versionNo },
      workflowState: submissions.workflowState,
      engineSyncStatus: submissions.engineSyncStatus,
      currentRevisionNo: submissions.currentRevisionNo,
      submittedAt: submissions.submittedAt,
      createdAt: submissions.createdAt,
      updatedAt: submissions.updatedAt,
    })
    .from(submissions)
    .leftJoin(forms, eq(submissions.formId, forms.id))
    .leftJoin(formVersions, eq(submissions.formVersionId, formVersions.id))
    .where(
      and(
        eq(submissions.workspaceId, workspaceId),
        eq(submissions.id, submissionId),
        isNull(submissions.deletedAt),
      ),
    )
    .limit(1);

  return row[0] ?? null;
};

/**
 * Resolve list-scope context for a submission by id alone. Returns null for missing/deleted submissions.
 */
export const getSubmissionListContext = async (
  submissionId: string,
): Promise<{ workspaceId: string; formId: string; formVersionId: string } | null> => {
  const row = await db
    .select({
      workspaceId: submissions.workspaceId,
      formId: submissions.formId,
      formVersionId: submissions.formVersionId,
    })
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), isNull(submissions.deletedAt)))
    .limit(1);

  return row[0] ?? null;
};

/**
 * Resolve the workspace that owns a submission, by submission id alone. Used to derive request
 * workspace context for deep links. Neutral: returns null for missing/deleted submissions (caller
 * maps to 404); access is still enforced downstream via membership.
 */
export const getWorkspaceIdForSubmission = async (submissionId: string): Promise<string | null> => {
  const context = await getSubmissionListContext(submissionId);
  return context?.workspaceId ?? null;
};

/** Resolve a submission's workspace + workflow state by id alone (for the file-upload gate). */
export const getSubmissionWorkspaceAndState = async (
  submissionId: string,
): Promise<{ workspaceId: string; workflowState: string } | null> => {
  const rows = await db
    .select({ workspaceId: submissions.workspaceId, workflowState: submissions.workflowState })
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), isNull(submissions.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
};

export const listSubmissionsForWorkspace = async (
  input: ListSubmissionsInput,
): Promise<{ items: SubmissionListRow[]; hasMore: boolean }> => {
  if (input.workspaceIds.length === 0) {
    return { items: [], hasMore: false };
  }
  const whereClauses = [
    inArray(submissions.workspaceId, input.workspaceIds),
    isNull(submissions.deletedAt),
    // Workspace/staff list shows only real submissions; a just-`opened` shell isn't one yet.
    // (A future user-scoped list would surface the caller's own opened submissions.)
    ne(submissions.workflowState, SubmissionWorkflowState.opened),
  ];

  if (input.formId) {
    whereClauses.push(eq(submissions.formId, input.formId));
  }

  if (input.formVersionId) {
    whereClauses.push(eq(submissions.formVersionId, input.formVersionId));
  }

  if (input.submissionId) {
    whereClauses.push(eq(submissions.id, input.submissionId));
  }

  if (input.workflowState) {
    whereClauses.push(eq(submissions.workflowState, input.workflowState));
  }

  if (input.createdBy) {
    whereClauses.push(eq(submissions.createdBy, input.createdBy));
  }

  if (input.cursorMode === 'id' && input.afterId) {
    whereClauses.push(lt(submissions.id, input.afterId));
  }

  if (input.cursorMode === 'ts_id' && input.afterId && input.afterUpdatedAt) {
    whereClauses.push(
      or(
        lt(submissions.updatedAt, input.afterUpdatedAt),
        and(eq(submissions.updatedAt, input.afterUpdatedAt), lt(submissions.id, input.afterId)),
      ),
    );
  }

  const rows = await db
    .select({
      id: submissions.id,
      formId: submissions.formId,
      form: { name: forms.name },
      formVersionId: submissions.formVersionId,
      formVersion: { versionNo: formVersions.versionNo },
      workflowState: submissions.workflowState,
      engineSyncStatus: submissions.engineSyncStatus,
      submittedAt: submissions.submittedAt,
      createdAt: submissions.createdAt,
      updatedAt: submissions.updatedAt,
    })
    .from(submissions)
    .innerJoin(forms, eq(submissions.formId, forms.id))
    .innerJoin(formVersions, eq(submissions.formVersionId, formVersions.id))
    .where(and(...whereClauses))
    .orderBy(
      input.cursorMode === 'ts_id' || input.sort === 'updatedAt:desc'
        ? desc(submissions.updatedAt)
        : desc(submissions.id),
      desc(submissions.id),
    )
    .limit(input.limit + 1);

  return {
    items: rows.slice(0, input.limit),
    hasMore: rows.length > input.limit,
  };
};

export const updateSubmissionDraft = async (
  workspaceId: string,
  submissionId: string,
  actorDisplayLabel: string | null,
  patch: Partial<{
    workflowState: string;
    engineSubmissionRef: string;
    engineSyncStatus: string;
    engineSyncError: string | null;
    submittedBy: string;
    submittedAt: Date;
  }>,
) => {
  const updated = await db
    .update(submissions)
    .set({
      ...patch,
      updatedBy: actorDisplayLabel,
      updatedAt: new Date(),
    })
    .where(and(eq(submissions.id, submissionId), eq(submissions.workspaceId, workspaceId)))
    .returning();

  return updated[0] ?? null;
};

/**
 * Record a submission revision and advance the submission's current pointer in one transaction.
 * `beforeEngineSubmissionRef` is the submission's current ref; `afterEngineSubmissionRef` is the
 * newly-created engine document for this save — so the revision captures the real change. Applies the
 * lifecycle-decided workflow state, marks the engine sync `ready`, and stamps `submitted_at` on submit.
 */
export const appendSubmissionRevision = async (input: SaveSubmissionInput) => {
  return db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(submissions)
      .where(
        and(eq(submissions.id, input.submissionId), eq(submissions.workspaceId, input.workspaceId)),
      )
      .limit(1);

    const submission = current[0];
    if (!submission) return null;

    const nextRevision = submission.currentRevisionNo + 1;

    await tx.insert(submissionRevisions).values({
      workspaceId: input.workspaceId,
      submissionId: input.submissionId,
      revisionNo: nextRevision,
      eventType: input.eventType,
      beforeEngineSubmissionRef: submission.engineSubmissionRef,
      afterEngineSubmissionRef: input.afterEngineSubmissionRef,
      changedBy: input.actorId,
    });

    const updates: Record<string, unknown> = {
      currentRevisionNo: nextRevision,
      engineSubmissionRef: input.afterEngineSubmissionRef,
      engineSyncStatus: 'ready',
      engineSyncError: null,
      workflowState: input.workflowState,
      updatedBy: input.actorDisplayLabel,
      updatedAt: new Date(),
    };

    // submittedBy is stamped at open; record the submit timestamp when the submit event lands.
    if (input.eventType === SubmissionEventType.submitted) {
      updates.submittedAt = new Date();
    }

    const updated = await tx
      .update(submissions)
      .set(updates)
      .where(
        and(eq(submissions.id, input.submissionId), eq(submissions.workspaceId, input.workspaceId)),
      )
      .returning();

    return updated[0] ?? null;
  });
};

export const markSubmissionDeleted = async (
  workspaceId: string,
  submissionId: string,
  actorDisplayLabel: string | null,
) => {
  const updated = await db
    .update(submissions)
    .set({
      workflowState: SubmissionWorkflowState.deleted,
      deletedAt: new Date(),
      deletedBy: actorDisplayLabel,
      updatedBy: actorDisplayLabel,
      updatedAt: new Date(),
    })
    .where(and(eq(submissions.id, submissionId), eq(submissions.workspaceId, workspaceId)))
    .returning();

  return updated[0] ?? null;
};
