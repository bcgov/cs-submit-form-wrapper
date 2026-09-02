import { and, count, eq, type SQL } from 'drizzle-orm';
import { db } from '../client';
import { documentGenerationAudits } from '../schema';
import { orderByForSort, type SortColumns, type SortToken } from '../listSort';
import { readListPage } from '../listRead';

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

export const DOCGEN_AUDIT_SORT_FIELDS = ['createdAt', 'outcome', 'durationMs'] as const;
export type DocgenAuditListSortField = (typeof DOCGEN_AUDIT_SORT_FIELDS)[number];
export type DocgenAuditListSort = SortToken<DocgenAuditListSortField>;

const DOCGEN_AUDIT_SORT_COLUMNS: SortColumns<DocgenAuditListSortField> = {
  createdAt: { column: documentGenerationAudits.createdAt },
  outcome: { column: documentGenerationAudits.outcome },
  durationMs: { column: documentGenerationAudits.durationMs },
};

export interface ListDocumentGenerationAuditFilters {
  workspaceId?: string;
  formId?: string;
  offset: number;
  limit: number;
  sort: DocgenAuditListSort;
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
): Promise<{ items: DocumentGenerationAuditRecord[]; total: number }> => {
  const conditions: SQL<unknown>[] = [];
  if (filters.workspaceId)
    conditions.push(eq(documentGenerationAudits.workspaceId, filters.workspaceId));
  if (filters.formId) conditions.push(eq(documentGenerationAudits.formId, filters.formId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return readListPage(async (tx) => {
    const items = await tx
      .select()
      .from(documentGenerationAudits)
      .where(where)
      .orderBy(
        ...orderByForSort(DOCGEN_AUDIT_SORT_COLUMNS, filters.sort, documentGenerationAudits.id),
      )
      .limit(filters.limit)
      .offset(filters.offset);
    const totals = await tx.select({ total: count() }).from(documentGenerationAudits).where(where);
    return { items, total: totals[0]?.total ?? 0 };
  });
};
