import { index, text, timestamp, uniqueIndex, uuid, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditColumns, idColumn, softDeleteColumns } from './audit';
import { appUsers, sobaSchema, workspaces } from './core';

export const forms = sobaSchema.table(
  'form',
  {
    id: idColumn(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    formEngineCode: text('form_engine_code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull(),
    ...auditColumns(),
    ...softDeleteColumns(),
  },
  (table) => ({
    // Non-deleted forms only, so a soft-deleted form frees its name for reuse.
    workspaceNameUnique: uniqueIndex('form_workspace_name_uq')
      .on(table.workspaceId, table.name)
      .where(sql`${table.deletedAt} is null`),
    workspaceIdx: index('form_workspace_idx').on(table.workspaceId),
  }),
);

export const formVersions = sobaSchema.table(
  'form_version',
  {
    id: idColumn(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    formId: uuid('form_id')
      .notNull()
      .references(() => forms.id),
    versionNo: integer('version_no').notNull(),
    state: text('state').notNull(),
    engineSchemaRef: text('engine_schema_ref'),
    engineSyncStatus: text('engine_sync_status').notNull(),
    engineSyncError: text('engine_sync_error'),
    currentRevisionNo: integer('current_revision_no').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => appUsers.id),
    ...auditColumns(),
    ...softDeleteColumns(),
  },
  (table) => ({
    uniqueVersion: uniqueIndex('form_version_workspace_form_version_uq').on(
      table.workspaceId,
      table.formId,
      table.versionNo,
    ),
    workspaceIdx: index('form_version_workspace_idx').on(table.workspaceId),
    formIdx: index('form_version_form_idx').on(table.formId),
  }),
);

export const formVersionRevisions = sobaSchema.table(
  'form_version_revision',
  {
    id: idColumn(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    formVersionId: uuid('form_version_id')
      .notNull()
      .references(() => formVersions.id),
    revisionNo: integer('revision_no').notNull(),
    eventType: text('event_type').notNull(),
    beforeEngineSchemaRef: text('before_engine_schema_ref'),
    afterEngineSchemaRef: text('after_engine_schema_ref'),
    changedBy: uuid('changed_by')
      .notNull()
      .references(() => appUsers.id),
    changeNote: text('change_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueRevision: uniqueIndex('form_version_revision_workspace_form_version_revision_uq').on(
      table.workspaceId,
      table.formVersionId,
      table.revisionNo,
    ),
    workspaceIdx: index('form_version_revision_workspace_idx').on(table.workspaceId),
  }),
);

export const submissions = sobaSchema.table(
  'submission',
  {
    id: idColumn(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    formId: uuid('form_id')
      .notNull()
      .references(() => forms.id),
    formVersionId: uuid('form_version_id')
      .notNull()
      .references(() => formVersions.id),
    submittedBy: uuid('submitted_by').references(() => appUsers.id),
    workflowState: text('workflow_state').notNull(),
    engineSubmissionRef: text('engine_submission_ref'),
    engineSyncStatus: text('engine_sync_status').notNull(),
    engineSyncError: text('engine_sync_error'),
    currentRevisionNo: integer('current_revision_no').notNull().default(0),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    ...auditColumns(),
    ...softDeleteColumns(),
  },
  (table) => ({
    workspaceWorkflowIdx: index('submission_workspace_workflow_idx').on(
      table.workspaceId,
      table.workflowState,
    ),
    workspaceIdx: index('submission_workspace_idx').on(table.workspaceId),
    formVersionIdx: index('submission_form_version_idx').on(table.formVersionId),
  }),
);

export const submissionRevisions = sobaSchema.table(
  'submission_revision',
  {
    id: idColumn(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id),
    revisionNo: integer('revision_no').notNull(),
    eventType: text('event_type').notNull(),
    beforeEngineSubmissionRef: text('before_engine_submission_ref'),
    afterEngineSubmissionRef: text('after_engine_submission_ref'),
    changedBy: uuid('changed_by')
      .notNull()
      .references(() => appUsers.id),
    changeNote: text('change_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueRevision: uniqueIndex('submission_revision_workspace_submission_revision_uq').on(
      table.workspaceId,
      table.submissionId,
      table.revisionNo,
    ),
    workspaceIdx: index('submission_revision_workspace_idx').on(table.workspaceId),
  }),
);
