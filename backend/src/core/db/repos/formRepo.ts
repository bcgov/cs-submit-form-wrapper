import { and, count, eq, ilike, inArray, isNull, ne } from 'drizzle-orm';
import { db, type DbOrTx } from '../client';
import { forms, formVersions } from '../schema';
import { likePattern, orderByForSort, type SortColumns, type SortToken } from '../listSort';
import { readListPage } from '../listRead';

export const FORM_SORT_FIELDS = ['name', 'status', 'createdAt', 'updatedAt'] as const;
export type FormListSortField = (typeof FORM_SORT_FIELDS)[number];
export type FormListSort = SortToken<FormListSortField>;

const FORM_SORT_COLUMNS: SortColumns<FormListSortField> = {
  name: { column: forms.name, caseInsensitive: true },
  status: { column: forms.status },
  createdAt: { column: forms.createdAt },
  updatedAt: { column: forms.updatedAt },
};

export interface ListFormsForWorkspaceInput {
  /** Workspace resolved from the list scope anchor. */
  workspaceIds: string[];
  offset: number;
  limit: number;
  formId?: string;
  q?: string;
  status?: string;
  sort: FormListSort;
}

export interface FormListRow {
  id: string;
  workspaceId: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface FormRecord {
  id: string;
  workspaceId: string;
  formEngineCode: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
}

interface CreateFormInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
  formEngineCode: string;
  name: string;
  description?: string;
}

interface UpdateFormInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
  formId: string;
  name?: string;
  description?: string | null;
  status?: string;
}

export const listFormsForWorkspace = async (
  input: ListFormsForWorkspaceInput,
): Promise<{ items: FormListRow[]; total: number }> => {
  // An empty scope means the actor holds the permission in no workspace, never "all workspaces".
  if (input.workspaceIds.length === 0) {
    return { items: [], total: 0 };
  }
  const whereClauses = [inArray(forms.workspaceId, input.workspaceIds), isNull(forms.deletedAt)];

  if (input.status) {
    whereClauses.push(eq(forms.status, input.status));
  }

  if (input.formId) {
    whereClauses.push(eq(forms.id, input.formId));
  }

  if (input.q) {
    whereClauses.push(ilike(forms.name, likePattern(input.q)));
  }

  const where = and(...whereClauses);

  return readListPage(async (tx) => {
    const items = await tx
      .select({
        id: forms.id,
        workspaceId: forms.workspaceId,
        name: forms.name,
        status: forms.status,
        createdAt: forms.createdAt,
        updatedAt: forms.updatedAt,
        createdBy: forms.createdBy,
        updatedBy: forms.updatedBy,
      })
      .from(forms)
      .where(where)
      .orderBy(...orderByForSort(FORM_SORT_COLUMNS, input.sort, forms.id))
      .limit(input.limit)
      .offset(input.offset);
    const totals = await tx.select({ total: count() }).from(forms).where(where);
    return { items, total: totals[0]?.total ?? 0 };
  });
};

export const getFormById = async (
  workspaceId: string,
  formId: string,
): Promise<FormRecord | null> => {
  const row = await db
    .select()
    .from(forms)
    .where(and(eq(forms.workspaceId, workspaceId), eq(forms.id, formId), isNull(forms.deletedAt)))
    .limit(1);

  return row[0] ?? null;
};

export const getFormByEngineSchemaRef = async (
  workspaceId: string,
  engineSchemaRef: string,
): Promise<FormRecord | null> => {
  const rows = await db
    .select({
      id: forms.id,
      workspaceId: forms.workspaceId,
      formEngineCode: forms.formEngineCode,
      name: forms.name,
      description: forms.description,
      status: forms.status,
      createdAt: forms.createdAt,
      updatedAt: forms.updatedAt,
      createdBy: forms.createdBy,
      updatedBy: forms.updatedBy,
      deletedAt: forms.deletedAt,
      deletedBy: forms.deletedBy,
    })
    .from(forms)
    .innerJoin(formVersions, eq(formVersions.formId, forms.id))
    .where(
      and(
        eq(forms.workspaceId, workspaceId),
        eq(formVersions.engineSchemaRef, engineSchemaRef),
        isNull(forms.deletedAt),
        isNull(formVersions.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
};

export const createForm = async (input: CreateFormInput, tx?: DbOrTx): Promise<FormRecord> => {
  const d = tx ?? db;
  const created = await d
    .insert(forms)
    .values({
      workspaceId: input.workspaceId,
      formEngineCode: input.formEngineCode,
      name: input.name,
      description: input.description,
      status: 'active',
      createdBy: input.actorDisplayLabel,
      updatedBy: input.actorDisplayLabel,
    })
    .returning();

  return created[0] as FormRecord;
};

/** True if a non-deleted form with this name exists in the workspace (optionally excluding one form). */
export const formNameExistsInWorkspace = async (
  workspaceId: string,
  name: string,
  exceptFormId?: string,
): Promise<boolean> => {
  const rows = await db
    .select({ id: forms.id })
    .from(forms)
    .where(
      and(
        eq(forms.workspaceId, workspaceId),
        eq(forms.name, name),
        isNull(forms.deletedAt),
        ...(exceptFormId ? [ne(forms.id, exceptFormId)] : []),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
};

export const updateForm = async (input: UpdateFormInput): Promise<FormRecord | null> => {
  const updated = await db
    .update(forms)
    .set({
      name: input.name,
      description: input.description,
      status: input.status,
      updatedBy: input.actorDisplayLabel,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(forms.id, input.formId),
        eq(forms.workspaceId, input.workspaceId),
        isNull(forms.deletedAt),
      ),
    )
    .returning();

  return (updated[0] as FormRecord) ?? null;
};

export const markFormDeleted = async (
  workspaceId: string,
  formId: string,
  actorDisplayLabel: string | null,
) => {
  const updated = await db
    .update(forms)
    .set({
      status: 'deleted',
      deletedAt: new Date(),
      deletedBy: actorDisplayLabel,
      updatedBy: actorDisplayLabel,
      updatedAt: new Date(),
    })
    .where(and(eq(forms.id, formId), eq(forms.workspaceId, workspaceId)))
    .returning();

  return updated[0] ?? null;
};

/**
 * Resolve list-scope context for a form by id alone. Returns null for missing/deleted forms.
 */
export const getFormListContext = async (
  formId: string,
): Promise<{ workspaceId: string } | null> => {
  const row = await db
    .select({ workspaceId: forms.workspaceId })
    .from(forms)
    .where(and(eq(forms.id, formId), isNull(forms.deletedAt)))
    .limit(1);

  return row[0] ?? null;
};

/**
 * Resolve the workspace that owns a form, by form id alone. Used to derive request workspace
 * context for deep links. Neutral: returns null for missing/deleted forms (caller maps to 404);
 * access is still enforced downstream via membership.
 */
export const getWorkspaceIdForForm = async (formId: string): Promise<string | null> => {
  const context = await getFormListContext(formId);
  return context?.workspaceId ?? null;
};

export const getFormEngineCodeForForm = async (
  workspaceId: string,
  formId: string,
): Promise<string | null> => {
  const row = await db
    .select({ engineCode: forms.formEngineCode })
    .from(forms)
    .where(and(eq(forms.workspaceId, workspaceId), eq(forms.id, formId), isNull(forms.deletedAt)))
    .limit(1);

  return row[0]?.engineCode ?? null;
};
