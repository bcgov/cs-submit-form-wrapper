import { and, eq, or } from 'drizzle-orm';
import { db } from '../client';
import { featureScopes } from '../schema';
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
 * status and audit stamp in place. Keeps test/setup routes idempotent across repeated runs.
 */
export const upsertFeatureScope = async (
  input: UpsertFeatureScopeInput,
): Promise<FeatureScopeRecord> => {
  const existing = await db
    .select()
    .from(featureScopes)
    .where(
      and(
        eq(featureScopes.featureCode, input.featureCode),
        eq(featureScopes.scopeType, input.scopeType),
        eq(featureScopes.scopeId, input.scopeId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(featureScopes)
      .set({
        status: input.status ?? existing[0].status,
        updatedAt: new Date(),
        updatedBy: input.updatedBy ?? null,
      })
      .where(eq(featureScopes.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(featureScopes)
    .values({
      featureCode: input.featureCode,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      status: input.status ?? FeatureScopeStatus.active,
      createdBy: input.updatedBy ?? null,
      updatedBy: input.updatedBy ?? null,
    })
    .returning();
  return created;
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
