import { and, count, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../client';
import { submissionRevisions, submissions, forms, formVersions } from '../schema';
import { likePattern, orderByForSort, type SortColumns, type SortToken } from '../listSort';
import { readListPage } from '../listRead';
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
  createdBy: string | null;
  submittedBy: string | null;
}

export interface SubmissionDetailRow extends SubmissionListRow {
  currentRevisionNo: number;
}

interface CreateSubmissionInput {
  /** Client-minted uuidv7; the submission's primary key (no longer server-generated). */
  id: string;
  workspaceId: string;
  formId: string;
  formVersionId: string;
  actorId: string;
  actorDisplayLabel: string | null;
}

/**
 * created  — the id was free; a new opened submission (+ revision 0) was written.
 * existing — the id is already bound to this actor + form; the retry returns that row (idempotent).
 * conflict — the id is bound to a different actor or form (caller maps to 409).
 */
export type OpenSubmissionResult =
  | { outcome: 'created'; record: SubmissionRecord }
  | { outcome: 'existing'; record: SubmissionRecord }
  | { outcome: 'conflict' };

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

export const SUBMISSION_SORT_FIELDS = [
  'formName',
  'submittedAt',
  'createdAt',
  'updatedAt',
] as const;
export type SubmissionListSortField = (typeof SUBMISSION_SORT_FIELDS)[number];
export type SubmissionListSort = SortToken<SubmissionListSortField>;

const SUBMISSION_SORT_COLUMNS: SortColumns<SubmissionListSortField> = {
  formName: { column: forms.name, caseInsensitive: true },
  // Only a submitted submission has one, so an unsubmitted row never leads either direction.
  submittedAt: { column: submissions.submittedAt, nullable: true },
  createdAt: { column: submissions.createdAt },
  updatedAt: { column: submissions.updatedAt },
};

export interface ListSubmissionsInput {
  /** Workspace resolved from the list scope anchor. */
  workspaceIds: string[];
  offset: number;
  limit: number;
  formId?: string;
  formVersionId?: string;
  submissionId?: string;
  workflowState?: string;
  createdBy?: string;
  q?: string;
  sort: SubmissionListSort;
}

/**
 * Open a submission against a client-minted id: insert the row in the `opened` state and its
 * revision-0 `opened` event in one transaction, so every submission has a full history from the
 * moment a fill begins. `submittedBy` captures the actor who started it (the seeded public user for
 * anonymous fills).
 *
 * Idempotent on the id. `ON CONFLICT DO NOTHING` is the atomic gate: the row is only written when the
 * id is free, so concurrent double-opens are race-safe — the loser inserts nothing, falls through to
 * the select, and sees the winner's committed row. A taken id is a retry (same actor + form → return
 * the existing row) or a genuine collision (different owner → let the caller answer 409, not 500).
 */
export const openSubmission = async (
  input: CreateSubmissionInput,
): Promise<OpenSubmissionResult> => {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(submissions)
      .values({
        id: input.id,
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
      .onConflictDoNothing()
      .returning();

    if (created) {
      await tx.insert(submissionRevisions).values({
        workspaceId: input.workspaceId,
        submissionId: created.id,
        revisionNo: 0,
        eventType: SubmissionEventType.opened,
        beforeEngineSubmissionRef: null,
        afterEngineSubmissionRef: null,
        changedBy: input.actorId,
      });
      return { outcome: 'created', record: created };
    }

    // Only a live row is a valid idempotent retry; a soft-deleted tombstone on the same id is a
    // collision (409), not a resume — otherwise the caller gets a 200 to a submission that save/
    // submit/fill all 404 on (they filter deletedAt).
    const [existing] = await tx
      .select()
      .from(submissions)
      .where(and(eq(submissions.id, input.id), isNull(submissions.deletedAt)))
      .limit(1);

    if (existing?.submittedBy === input.actorId && existing?.formId === input.formId) {
      return { outcome: 'existing', record: existing };
    }
    return { outcome: 'conflict' };
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
      createdBy: submissions.createdBy,
      submittedBy: submissions.submittedBy,
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
): Promise<{ items: SubmissionListRow[]; total: number }> => {
  if (input.workspaceIds.length === 0) {
    return { items: [], total: 0 };
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

  if (input.q) {
    const pattern = likePattern(input.q);
    whereClauses.push(
      or(ilike(forms.name, pattern), sql`${submissions.id}::text ilike ${pattern}`),
    );
  }

  const where = and(...whereClauses);

  return readListPage(async (tx) => {
    const items = await tx
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
        createdBy: submissions.createdBy,
        submittedBy: submissions.submittedBy,
      })
      .from(submissions)
      .innerJoin(forms, eq(submissions.formId, forms.id))
      .innerJoin(formVersions, eq(submissions.formVersionId, formVersions.id))
      .where(where)
      .orderBy(...orderByForSort(SUBMISSION_SORT_COLUMNS, input.sort, submissions.id))
      .limit(input.limit)
      .offset(input.offset);

    // Both parent ids are not-null with validated foreign keys, so the joins can neither drop nor
    // multiply a row. The count only needs `forms`, and only when the search reads its name.
    const countQuery = tx.select({ total: count() }).from(submissions);
    const totals = await (input.q
      ? countQuery.innerJoin(forms, eq(submissions.formId, forms.id)).where(where)
      : countQuery.where(where));

    return { items, total: totals[0]?.total ?? 0 };
  });
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
