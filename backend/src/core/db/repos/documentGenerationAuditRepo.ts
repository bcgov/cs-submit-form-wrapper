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
 */
export const listDocumentGenerationAudits = async (
  filters: ListDocumentGenerationAuditFilters,
): Promise<DocumentGenerationAuditRecord[]> => {
  const conditions: SQL<unknown>[] = [];
  if (filters.workspaceId)
    conditions.push(eq(documentGenerationAudits.workspaceId, filters.workspaceId));
  if (filters.formId) conditions.push(eq(documentGenerationAudits.formId, filters.formId));

  let where = undefined;
  if (conditions.length === 1) {
    where = conditions[0];
  } else if (conditions.length > 1) {
    where = and(...conditions);
  }

  return db
    .select()
    .from(documentGenerationAudits)
    .where(where)
    .orderBy(desc(documentGenerationAudits.createdAt))
    .limit(filters.limit ?? 100);
};
