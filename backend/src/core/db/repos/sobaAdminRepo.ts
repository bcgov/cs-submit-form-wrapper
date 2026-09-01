import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db } from '../client';
import { appUsers, sobaAdmins } from '../schema';

/** Second int for `pg_advisory_xact_lock`; must not collide with workspaceRepo / membershipRepo lock ids. */
const ADV_LOCK_UPSERT_SOBA_ADMIN = 1_774_566_321;

export const SOBA_ADMIN_SOURCE_IDP = 'idp';
export const SOBA_ADMIN_SOURCE_DIRECT = 'direct';

export interface SobaAdminListRow {
  userId: string;
  source: string;
  identityProviderCode: string | null;
  syncedAt: Date | null;
  displayLabel: string | null;
}

export interface ListSobaAdminsInput {
  limit: number;
  afterUserId?: string;
}

/**
 * List SOBA platform admins with user display label (cursor-paginated by userId).
 */
export async function listSobaAdmins(
  input: ListSobaAdminsInput,
): Promise<{ items: SobaAdminListRow[]; hasMore: boolean }> {
  const base = db
    .select({
      userId: sobaAdmins.userId,
      source: sobaAdmins.source,
      identityProviderCode: sobaAdmins.identityProviderCode,
      syncedAt: sobaAdmins.syncedAt,
      displayLabel: appUsers.displayLabel,
    })
    .from(sobaAdmins)
    .innerJoin(appUsers, eq(appUsers.id, sobaAdmins.userId));
  const withWhere = input.afterUserId ? base.where(lt(sobaAdmins.userId, input.afterUserId)) : base;
  const rows = await withWhere.orderBy(desc(sobaAdmins.userId)).limit(input.limit + 1);
  return {
    items: rows.slice(0, input.limit),
    hasMore: rows.length > input.limit,
  };
}

/**
 * Returns whether the user is a SOBA platform admin (from table: idp-sourced or direct).
 */
export async function isSobaAdmin(userId: string): Promise<boolean> {
  const row = await db
    .select({ userId: sobaAdmins.userId })
    .from(sobaAdmins)
    .where(eq(sobaAdmins.userId, userId))
    .limit(1);
  return Boolean(row[0]);
}

/**
 * Refreshes soba_admin from IdP on login.
 * - If isAdmin: insert new row with source='idp', or update existing only when it is already idp-sourced (refresh syncedAt). Never overwrite a direct grant with idp.
 * - If !isAdmin: delete row only when current row is idp-sourced for this IdP (revoke IdP grant).
 * Direct grants are never changed or removed here.
 */
export async function upsertSobaAdminFromIdp(
  userId: string,
  idpCode: string,
  isAdmin: boolean,
  actorDisplayLabel: string | null,
): Promise<void> {
  const now = new Date();
  const normalizedIdp = idpCode.toLowerCase();

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${userId}::text), ${ADV_LOCK_UPSERT_SOBA_ADMIN})`,
    );
    const existing = await tx
      .select()
      .from(sobaAdmins)
      .where(eq(sobaAdmins.userId, userId))
      .limit(1);

    const row = existing[0];

    if (isAdmin) {
      if (row) {
        // Only update when already idp-sourced; never overwrite direct with idp (would lose direct grant if IdP later revokes)
        if (row.source === SOBA_ADMIN_SOURCE_IDP) {
          await tx
            .update(sobaAdmins)
            .set({
              identityProviderCode: normalizedIdp,
              syncedAt: now,
              updatedAt: now,
              updatedBy: actorDisplayLabel,
            })
            .where(eq(sobaAdmins.userId, userId));
        }
        // else: source is direct — leave as-is
      } else {
        await tx.insert(sobaAdmins).values({
          userId,
          source: SOBA_ADMIN_SOURCE_IDP,
          identityProviderCode: normalizedIdp,
          syncedAt: now,
          createdBy: actorDisplayLabel,
          updatedBy: actorDisplayLabel,
        });
      }
    } else {
      // Revoke: remove only if current grant is from this IdP
      if (row?.source === SOBA_ADMIN_SOURCE_IDP && row.identityProviderCode === normalizedIdp) {
        await tx.delete(sobaAdmins).where(eq(sobaAdmins.userId, userId));
      }
    }
  });
}

/**
 * Manually add (or pin) a user as SOBA admin (source='direct').
 * An idp-sourced row becomes direct so they remain admin even if the IdP revokes.
 * user_id is a foreign key to app_user, so the caller must confirm the user exists.
 */
export async function addDirectSobaAdmin(
  userId: string,
  addedByDisplayLabel: string | null,
): Promise<void> {
  await db
    .insert(sobaAdmins)
    .values({
      userId,
      source: SOBA_ADMIN_SOURCE_DIRECT,
      identityProviderCode: null,
      syncedAt: null,
      createdBy: addedByDisplayLabel,
      updatedBy: addedByDisplayLabel,
    })
    .onConflictDoUpdate({
      target: sobaAdmins.userId,
      set: {
        source: SOBA_ADMIN_SOURCE_DIRECT,
        identityProviderCode: null,
        syncedAt: null,
        updatedAt: new Date(),
        updatedBy: addedByDisplayLabel,
      },
    });
}

/**
 * Remove a direct SOBA admin grant. No-op if user is not in table or source is not 'direct'.
 */
export async function removeDirectSobaAdmin(userId: string): Promise<boolean> {
  const result = await db
    .delete(sobaAdmins)
    .where(and(eq(sobaAdmins.userId, userId), eq(sobaAdmins.source, SOBA_ADMIN_SOURCE_DIRECT)));
  return (result.rowCount ?? 0) > 0;
}
