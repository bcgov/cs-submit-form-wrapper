import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../client';
import {
  appUsers,
  identityProviders,
  userIdentities,
  workspaceDisclaimerAcceptances,
  workspaceMemberships,
  workspaces,
} from '../schema';
import { getCacheAdapter } from '../../integrations/plugins/PluginRegistry';
import { membershipKey } from '../../integrations/cache/cacheKeys';
import { profileHelpers } from '../../auth/jwtClaims';
import { ForbiddenError } from '../../errors';
import type { NormalizedProfile, IdpAttributes } from '../../auth/jwtClaims';
import { WorkspaceMembershipRole } from '../codes';

/** Second int for `pg_advisory_xact_lock`; must not collide with workspaceRepo / sobaAdminRepo lock ids. */
const ADV_LOCK_FIND_OR_CREATE_IDENTITY = 2_147_483_622;

export { findUserIdByIdentity } from './identityLookup';

export const findOrCreateUserByIdentity = async (
  providerCode: string,
  subject: string,
  profile?: NormalizedProfile | null,
  idpAttributes?: IdpAttributes | null,
) => {
  return db.transaction(async (tx) => {
    const normalizedProvider = providerCode.toLowerCase();
    const providerRow = await tx
      .select()
      .from(identityProviders)
      .where(eq(identityProviders.code, normalizedProvider))
      .limit(1);
    const provider = providerRow[0];

    // Only identity providers present AND active in identity_provider may authenticate.
    // Unknown or deactivated IdPs are rejected; we no longer implicitly create providers.
    if (!provider || !provider.isActive) {
      throw new ForbiddenError(
        `Identity provider '${normalizedProvider}' is not enabled for sign-in`,
      );
    }

    // Advisory lock shape shared with findOrCreateUserByIdentity: hashtext(single ::text param), fixed namespace int.
    const identityLockPayload = `${provider.code}\u001f${subject}`;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${identityLockPayload}::text), ${ADV_LOCK_FIND_OR_CREATE_IDENTITY})`,
    );

    const existing = await tx
      .select({ userId: userIdentities.userId, id: userIdentities.id })
      .from(userIdentities)
      .where(
        and(
          eq(userIdentities.identityProviderCode, provider.code),
          eq(userIdentities.subject, subject),
        ),
      )
      .limit(1);

    const existingRow = existing[0];

    if (existingRow) {
      const updates: { idpAttributes?: IdpAttributes; updatedAt: Date } = { updatedAt: new Date() };
      if (idpAttributes != null) updates.idpAttributes = idpAttributes;
      if (updates.idpAttributes != null) {
        await tx.update(userIdentities).set(updates).where(eq(userIdentities.id, existingRow.id));
      }
      return existingRow.userId;
    }

    const displayLabel = profileHelpers.getDisplayLabel(profile, subject) ?? subject;
    const createdUser = await tx
      .insert(appUsers)
      .values({
        id: uuidv7(),
        displayLabel,
        profile: profile ?? { displayName: subject },
        status: 'active',
        createdBy: displayLabel,
        updatedBy: displayLabel,
      })
      .returning({ id: appUsers.id });

    const userId = createdUser[0].id;

    await tx.insert(userIdentities).values({
      id: uuidv7(),
      userId,
      identityProviderCode: provider.code,
      subject,
      idpAttributes: idpAttributes ?? undefined,
      createdBy: displayLabel,
      updatedBy: displayLabel,
    });

    return userId;
  });
};

export const actorBelongsToWorkspace = async (workspaceId: string, userId: string) => {
  const row = await db
    .select({ id: workspaceMemberships.id })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId),
        eq(workspaceMemberships.status, 'active'),
      ),
    )
    .limit(1);

  return Boolean(row[0]);
};

export const getWorkspaceForUser = async (workspaceId: string, userId: string) => {
  const row = await db
    .select({
      id: workspaces.id,
      kind: workspaces.kind,
      name: workspaces.name,
      org: workspaces.org,
      useCase: workspaces.useCase,
      status: workspaces.status,
      membershipId: workspaceMemberships.id,
      role: workspaceMemberships.role,
      disclaimerAcceptedAt: workspaceDisclaimerAcceptances.acceptedAt,
    })
    .from(workspaces)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, workspaces.id),
        eq(workspaceMemberships.userId, userId),
        eq(workspaceMemberships.status, 'active'),
      ),
    )
    .leftJoin(
      workspaceDisclaimerAcceptances,
      eq(workspaceDisclaimerAcceptances.workspaceId, workspaces.id),
    )
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return row[0] ?? null;
};

/** Owner or admin membership roles may manage or mutate workspace settings. */
export const isWorkspaceManageRole = (role: string): boolean =>
  role === WorkspaceMembershipRole.owner || role === WorkspaceMembershipRole.admin;

/**
 * All workspace ids the user is an active member of. Used to scope cross-workspace list/search
 * queries when no specific `workspaceId` filter is supplied.
 */
export const getActiveWorkspaceIdsForUser = async (userId: string): Promise<string[]> => {
  const rows = await db
    .select({ workspaceId: workspaceMemberships.workspaceId })
    .from(workspaceMemberships)
    .where(and(eq(workspaceMemberships.userId, userId), eq(workspaceMemberships.status, 'active')));

  return rows.map((row) => row.workspaceId);
};

/**
 * Invalidate cached membership for a workspace/user after insert/update/delete.
 * Call from code that mutates workspace memberships (e.g. workspaceRepo, seed).
 * The cached row includes `role`, which gates management — a role change that skips this
 * leaves a demoted admin with authority until the cache TTL expires.
 */
export const invalidateMembershipCache = (workspaceId: string, userId: string): void => {
  try {
    getCacheAdapter().delete(membershipKey(workspaceId, userId));
  } catch {
    // Cache adapter may not be available (e.g. during seed before full app init).
  }
};

export type WorkspaceListSort = 'id:desc' | 'updatedAt:desc';
export type WorkspaceListCursorMode = 'id' | 'ts_id';

export interface ListWorkspacesForUserInput {
  userId: string;
  limit: number;
  sort: WorkspaceListSort;
  cursorMode: WorkspaceListCursorMode;
  afterId?: string;
  afterUpdatedAt?: Date;
  kind?: string;
  status?: string;
}

export interface WorkspaceListRow {
  id: string;
  name: string;
  kind: string;
  role: string;
  status: string;
  org: string | null;
  useCase: string | null;
  disclaimerAcceptedAt: Date | null;
  updatedAt: Date;
}

export const listWorkspacesForUser = async (
  input: ListWorkspacesForUserInput,
): Promise<{ items: WorkspaceListRow[]; hasMore: boolean }> => {
  const whereClauses = [
    eq(workspaceMemberships.userId, input.userId),
    eq(workspaceMemberships.status, 'active'),
  ];
  if (input.kind) {
    whereClauses.push(eq(workspaces.kind, input.kind));
  }
  if (input.status) {
    whereClauses.push(eq(workspaces.status, input.status));
  }
  if (input.cursorMode === 'id' && input.afterId) {
    whereClauses.push(lt(workspaces.id, input.afterId));
  }
  if (input.cursorMode === 'ts_id' && input.afterId && input.afterUpdatedAt) {
    whereClauses.push(
      or(
        lt(workspaces.updatedAt, input.afterUpdatedAt),
        and(eq(workspaces.updatedAt, input.afterUpdatedAt), lt(workspaces.id, input.afterId)),
      ),
    );
  }

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      kind: workspaces.kind,
      role: workspaceMemberships.role,
      status: workspaces.status,
      org: workspaces.org,
      useCase: workspaces.useCase,
      disclaimerAcceptedAt: workspaceDisclaimerAcceptances.acceptedAt,
      updatedAt: workspaces.updatedAt,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .leftJoin(
      workspaceDisclaimerAcceptances,
      eq(workspaceDisclaimerAcceptances.workspaceId, workspaces.id),
    )
    .where(and(...whereClauses))
    .orderBy(
      input.cursorMode === 'ts_id' || input.sort === 'updatedAt:desc'
        ? desc(workspaces.updatedAt)
        : desc(workspaces.id),
      desc(workspaces.id),
    )
    .limit(input.limit + 1);

  return {
    items: rows.slice(0, input.limit),
    hasMore: rows.length > input.limit,
  };
};

export interface WorkspaceMemberRow {
  id: string;
  userId: string;
  displayLabel: string | null;
  role: string;
  status: string;
  updatedAt: Date;
}

export type MemberListSort = 'id:desc' | 'updatedAt:desc';
export type MemberListCursorMode = 'id' | 'ts_id';

export interface ListMembersForWorkspaceInput {
  workspaceId: string;
  limit: number;
  sort: MemberListSort;
  cursorMode: MemberListCursorMode;
  afterId?: string;
  afterUpdatedAt?: Date;
  role?: string;
  status?: string;
}

export const listMembersForWorkspace = async (
  input: ListMembersForWorkspaceInput,
): Promise<{ items: WorkspaceMemberRow[]; hasMore: boolean }> => {
  const whereClauses = [eq(workspaceMemberships.workspaceId, input.workspaceId)];
  if (input.role) {
    whereClauses.push(eq(workspaceMemberships.role, input.role));
  }
  if (input.status) {
    whereClauses.push(eq(workspaceMemberships.status, input.status));
  }
  if (input.cursorMode === 'id' && input.afterId) {
    whereClauses.push(lt(workspaceMemberships.id, input.afterId));
  }
  if (input.cursorMode === 'ts_id' && input.afterId && input.afterUpdatedAt) {
    whereClauses.push(
      or(
        lt(workspaceMemberships.updatedAt, input.afterUpdatedAt),
        and(
          eq(workspaceMemberships.updatedAt, input.afterUpdatedAt),
          lt(workspaceMemberships.id, input.afterId),
        ),
      ),
    );
  }

  const rows = await db
    .select({
      id: workspaceMemberships.id,
      userId: workspaceMemberships.userId,
      displayLabel: appUsers.displayLabel,
      role: workspaceMemberships.role,
      status: workspaceMemberships.status,
      updatedAt: workspaceMemberships.updatedAt,
    })
    .from(workspaceMemberships)
    .innerJoin(appUsers, eq(appUsers.id, workspaceMemberships.userId))
    .where(and(...whereClauses))
    .orderBy(
      input.cursorMode === 'ts_id' || input.sort === 'updatedAt:desc'
        ? desc(workspaceMemberships.updatedAt)
        : desc(workspaceMemberships.id),
      desc(workspaceMemberships.id),
    )
    .limit(input.limit + 1);

  return {
    items: rows.slice(0, input.limit),
    hasMore: rows.length > input.limit,
  };
};
