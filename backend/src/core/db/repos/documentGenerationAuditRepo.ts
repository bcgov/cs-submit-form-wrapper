import { and, desc, eq, type SQL } from 'drizzle-orm';
import { db } from '../client';
import { documentGenerationAudits } from '../schema';

export type DocumentGenerationAuditRecord = typeof documentGenerationAudits.$inferSelect;

export interface NewDocumentGenerationAudit {
  workspaceId: string;
  formId: string;
  submissionId: string;
  mode: string;
  backendCode: string;
  outcome: string;
  httpStatus?: number | null;
  durationMs: number;
  errorDetail?: string | null;
  requestId?: string | null;
  createdBy: string;
}

export interface ListDocumentGenerationAuditFilters {
  workspaceId?: string;
  formId?: string;
  limit?: number;
}

export const createDocumentGenerationAudit = async (
  input: NewDocumentGenerationAudit,
): Promise<void> => {
  await db.insert(documentGenerationAudits).values({
    workspaceId: input.workspaceId,
    formId: input.formId,
    submissionId: input.submissionId,
    mode: input.mode,
    backendCode: input.backendCode,
    outcome: input.outcome,
    httpStatus: input.httpStatus ?? null,
    durationMs: input.durationMs,
    errorDetail: input.errorDetail ?? null,
    requestId: input.requestId ?? null,
    createdBy: input.createdBy,
  });
};

/**
 * List recent document generation audit rows for a workspace/form scope.
 * Caller should validate at least one scope filter is provided.
 * Reads one row past the limit so the caller can report that the list was cut short.
 */
export const listDocumentGenerationAudits = async (
  filters: ListDocumentGenerationAuditFilters,
): Promise<{ items: DocumentGenerationAuditRecord[]; hasMore: boolean }> => {
  const conditions: SQL<unknown>[] = [];
  if (filters.workspaceId)
    conditions.push(eq(documentGenerationAudits.workspaceId, filters.workspaceId));
  if (filters.formId) conditions.push(eq(documentGenerationAudits.formId, filters.formId));

  const limit = filters.limit ?? 100;
  const rows = await db
    .select()
    .from(documentGenerationAudits)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(documentGenerationAudits.createdAt))
    .limit(limit + 1);

  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
};
