import { index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { idColumn } from './audit';
import { sobaSchema, appUsers, workspaces } from './core';
import { forms, submissions } from './forms';

/**
 * Append-only log of document-generation backend calls: one row per adapter render invocation
 * (success or error). Records who called it, which backend was attempted, and the outcome. Written
 * non-blocking; rows are never updated or deleted. Security/permission failures are tracked elsewhere.
 */
export const documentGenerationAudits = sobaSchema.table(
  'document_generation_audit',
  {
    id: idColumn(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    formId: uuid('form_id')
      .notNull()
      .references(() => forms.id),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id),
    mode: text('mode').notNull(),
    backendCode: text('backend_code').notNull(),
    outcome: text('outcome').notNull(),
    // App-mapped response status on error (400/415/422 = bad request/template, 503 = backend
    // unavailable); null on success. The raw upstream status is carried in error_detail.
    httpStatus: integer('http_status'),
    durationMs: integer('duration_ms').notNull(),
    // Error class only (e.g. ServiceUnavailableError) — never the upstream body, to avoid storing PI.
    errorDetail: text('error_detail'),
    // Correlation id (X-Request-Id) to pivot an audit row back to the request's app logs.
    requestId: text('request_id'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workspaceCreatedIdx: index('document_generation_audit_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
    formCreatedIdx: index('document_generation_audit_form_created_idx').on(
      table.formId,
      table.createdAt,
    ),
    workspaceDurationIdx: index('document_generation_audit_workspace_duration_idx').on(
      table.workspaceId,
      table.durationMs.desc(),
      table.id.desc(),
    ),
    workspaceOutcomeIdx: index('document_generation_audit_workspace_outcome_idx').on(
      table.workspaceId,
      table.outcome,
      table.id.desc(),
    ),
    formDurationIdx: index('document_generation_audit_form_duration_idx').on(
      table.formId,
      table.durationMs.desc(),
      table.id.desc(),
    ),
    formOutcomeIdx: index('document_generation_audit_form_outcome_idx').on(
      table.formId,
      table.outcome,
      table.id.desc(),
    ),
  }),
);
