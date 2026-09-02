import { and, count, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../client';
import { featureScopes } from '../schema';
import { orderByForSort, type SortColumns, type SortToken } from '../listSort';
import { readListPage } from '../listRead';
import { FeatureScopeStatus, FeatureScopeType } from '../codes';

export type FeatureScopeRecord = typeof featureScopes.$inferSelect;

export interface NewFeatureScope {
  featureCode: string;
  scopeType: string;
  scopeId: string;
  status?: string;
  createdBy?: string | null;
}

export interface UpsertFeatureScopeInput {
  featureCode: string;
  scopeType: string;
  scopeId: string;
  status?: string;
  updatedBy?: string | null;
}

export const FEATURE_SCOPE_SORT_FIELDS = [
  'featureCode',
  'scopeType',
  'status',
  'createdAt',
  'updatedAt',
] as const;
export type FeatureScopeListSortField = (typeof FEATURE_SCOPE_SORT_FIELDS)[number];
export type FeatureScopeListSort = SortToken<FeatureScopeListSortField>;

const FEATURE_SCOPE_SORT_COLUMNS: SortColumns<FeatureScopeListSortField> = {
  featureCode: { column: featureScopes.featureCode },
  scopeType: { column: featureScopes.scopeType },
  status: { column: featureScopes.status },
  createdAt: { column: featureScopes.createdAt },
  updatedAt: { column: featureScopes.updatedAt },
};

export interface ListFeatureScopesInput {
  featureCode?: string;
  /** The features this deployment scopes. The rest are not the admin's to manage. */
  featureCodes?: string[];
  scopeType?: string;
  status?: string;
  offset: number;
  limit: number;
  sort: FeatureScopeListSort;
}

export const createFeatureScope = async (input: NewFeatureScope): Promise<FeatureScopeRecord> => {
  const [row] = await db
    .insert(featureScopes)
    .values({
      featureCode: input.featureCode,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      status: input.status ?? FeatureScopeStatus.active,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row;
};

/**
 * Ensure one grant row per (feature, scopeType, scopeId): create it when missing, otherwise update
 * status and audit stamp in place. Resolved by the database against
 * `feature_scope_code_scope_uq`, so concurrent callers cannot race into a duplicate or a 409.
 * An omitted status leaves an existing row's status alone; a new row starts active. createdBy is
 * only ever set by the insert.
 */
export const upsertFeatureScope = async (
  input: UpsertFeatureScopeInput,
): Promise<FeatureScopeRecord> => {
  const [row] = await db
    .insert(featureScopes)
    .values({
      featureCode: input.featureCode,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      status: input.status ?? FeatureScopeStatus.active,
      createdBy: input.updatedBy ?? null,
      updatedBy: input.updatedBy ?? null,
    })
    .onConflictDoUpdate({
      target: [featureScopes.featureCode, featureScopes.scopeType, featureScopes.scopeId],
      set: {
        status: input.status ?? sql`${featureScopes.status}`,
        updatedAt: new Date(),
        updatedBy: input.updatedBy ?? null,
      },
    })
    .returning();
  return row;
};

export const listFeatureScopes = async (
  input: ListFeatureScopesInput,
): Promise<{ items: FeatureScopeRecord[]; total: number }> => {
  // An empty allow-list means no feature is the admin's to manage, never "every feature".
  if (input.featureCodes && input.featureCodes.length === 0) {
    return { items: [], total: 0 };
  }
  const conditions: SQL<unknown>[] = [];
  if (input.featureCode) conditions.push(eq(featureScopes.featureCode, input.featureCode));
  if (input.featureCodes) conditions.push(inArray(featureScopes.featureCode, input.featureCodes));
  if (input.scopeType) conditions.push(eq(featureScopes.scopeType, input.scopeType));
  if (input.status) conditions.push(eq(featureScopes.status, input.status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return readListPage(async (tx) => {
    const items = await tx
      .select()
      .from(featureScopes)
      .where(where)
      .orderBy(...orderByForSort(FEATURE_SCOPE_SORT_COLUMNS, input.sort, featureScopes.id))
      .limit(input.limit)
      .offset(input.offset);
    const totals = await tx.select({ total: count() }).from(featureScopes).where(where);
    return { items, total: totals[0]?.total ?? 0 };
  });
};

export const getFeatureScopeById = async (id: string): Promise<FeatureScopeRecord | null> => {
  const rows = await db.select().from(featureScopes).where(eq(featureScopes.id, id)).limit(1);
  return rows[0] ?? null;
};

/** False when no grant had that id, so the caller can answer 404 the way the read route does. */
export const removeFeatureScope = async (id: string): Promise<boolean> => {
  const deleted = await db
    .delete(featureScopes)
    .where(eq(featureScopes.id, id))
    .returning({ id: featureScopes.id });
  return deleted.length > 0;
};

export interface FeatureGrantLookup {
  featureCode: string;
  workspaceId?: string | null;
  formId?: string | null;
}

/**
 * True when an active grant makes `featureCode` available to the given workspace or form. Form and
 * workspace grants are independent — a match on either suffices. Returns false without querying when
 * neither id is supplied, so the caller never matches an unrelated grant for the same feature.
 */
export const hasActiveFeatureGrant = async (lookup: FeatureGrantLookup): Promise<boolean> => {
  const scopeMatchers = [];
  if (lookup.formId) {
    scopeMatchers.push(
      and(
        eq(featureScopes.scopeType, FeatureScopeType.form),
        eq(featureScopes.scopeId, lookup.formId),
      ),
    );
  }
  if (lookup.workspaceId) {
    scopeMatchers.push(
      and(
        eq(featureScopes.scopeType, FeatureScopeType.workspace),
        eq(featureScopes.scopeId, lookup.workspaceId),
      ),
    );
  }
  if (scopeMatchers.length === 0) return false;

  const rows = await db
    .select({ id: featureScopes.id })
    .from(featureScopes)
    .where(
      and(
        eq(featureScopes.featureCode, lookup.featureCode),
        eq(featureScopes.status, FeatureScopeStatus.active),
        scopeMatchers.length === 1 ? scopeMatchers[0] : or(...scopeMatchers),
      ),
    )
    .limit(1);
  return rows.length > 0;
};
