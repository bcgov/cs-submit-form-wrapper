import { and, count, eq, exists, ilike, or, sql, inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../client';
import {
  appUsers,
  identityProviders,
  userIdentities,
  workspaceDisclaimerAcceptances,
  workspaceMemberships,
  workspaceGroupMemberships,
  workspaceGroupRoles,
  rolePermissions,
  workspaces,
} from '../schema';
import { getCacheAdapter } from '../../integrations/plugins/PluginRegistry';
import { membershipKey } from '../../integrations/cache/cacheKeys';
import { profileHelpers } from '../../auth/jwtClaims';
import { ForbiddenError } from '../../errors';
import type { NormalizedProfile, IdpAttributes } from '../../auth/jwtClaims';
import {
  GroupMemberKind,
  Permissions,
  WorkspaceGroupMembershipStatus,
  WorkspaceGroupRoleStatus,
  WorkspaceMembershipRole,
} from '../codes';
import { likePattern, orderByForSort, type SortColumns, type SortToken } from '../listSort';
import { readListPage } from '../listRead';

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

export const WORKSPACE_SORT_FIELDS = ['name', 'kind', 'status', 'updatedAt'] as const;
export type WorkspaceListSortField = (typeof WORKSPACE_SORT_FIELDS)[number];
export type WorkspaceListSort = SortToken<WorkspaceListSortField>;

const WORKSPACE_SORT_COLUMNS: SortColumns<WorkspaceListSortField> = {
  name: { column: workspaces.name, caseInsensitive: true },
  kind: { column: workspaces.kind },
  status: { column: workspaces.status },
  updatedAt: { column: workspaces.updatedAt },
};

export interface ListWorkspacesForUserInput {
  userId: string;
  offset: number;
  limit: number;
  sort: WorkspaceListSort;
  kind?: string;
  status?: string;
  q?: string;
  requiredPermission?: string;
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
): Promise<{ items: WorkspaceListRow[]; total: number }> => {
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
  if (input.q) {
    const pattern = likePattern(input.q);
    whereClauses.push(or(ilike(workspaces.name, pattern), ilike(workspaces.org, pattern)));
  }
  if (input.requiredPermission) {
    // Correlated to the actor's own membership row above, not just any member of the workspace.
    whereClauses.push(
      exists(
        db
          .select({ permissionCode: rolePermissions.permissionCode })
          .from(workspaceGroupMemberships)
          .innerJoin(
            workspaceGroupRoles,
            eq(workspaceGroupRoles.groupId, workspaceGroupMemberships.groupId),
          )
          .innerJoin(rolePermissions, eq(rolePermissions.roleCode, workspaceGroupRoles.roleCode))
          .where(
            and(
              eq(workspaceGroupMemberships.workspaceMembershipId, workspaceMemberships.id),
              eq(workspaceGroupMemberships.workspaceId, workspaceMemberships.workspaceId),
              eq(workspaceGroupMemberships.memberKind, GroupMemberKind.user),
              eq(workspaceGroupMemberships.status, WorkspaceGroupMembershipStatus.active),
              eq(workspaceGroupRoles.status, WorkspaceGroupRoleStatus.active),
              inArray(rolePermissions.permissionCode, [input.requiredPermission, Permissions.all]),
            ),
          ),
      ),
    );
  }

  const where = and(...whereClauses);

  return readListPage(async (tx) => {
    const items = await tx
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
      .where(where)
      .orderBy(...orderByForSort(WORKSPACE_SORT_COLUMNS, input.sort, workspaces.id))
      .limit(input.limit)
      .offset(input.offset);

    // Mirrors the page query's joins. The acceptance join is 1:0-or-1 only because workspace_id is
    // that table's primary key; per-user acceptance would multiply page rows and not the count.
    const totals = await tx
      .select({ total: count() })
      .from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .leftJoin(
        workspaceDisclaimerAcceptances,
        eq(workspaceDisclaimerAcceptances.workspaceId, workspaces.id),
      )
      .where(where);

    return { items, total: totals[0]?.total ?? 0 };
  });
};

export interface WorkspaceMemberRow {
  id: string;
  userId: string;
  displayLabel: string | null;
  role: string;
  status: string;
  updatedAt: Date;
}

export const MEMBER_SORT_FIELDS = ['displayLabel', 'role', 'status'] as const;
export type MemberListSortField = (typeof MEMBER_SORT_FIELDS)[number];
export type MemberListSort = SortToken<MemberListSortField>;

const MEMBER_SORT_COLUMNS: SortColumns<MemberListSortField> = {
  // A user who has never signed in has no label yet.
  displayLabel: { column: appUsers.displayLabel, nullable: true, caseInsensitive: true },
  role: { column: workspaceMemberships.role },
  status: { column: workspaceMemberships.status },
};

export interface ListMembersForWorkspaceInput {
  workspaceId: string;
  offset: number;
  limit: number;
  sort: MemberListSort;
  role?: string;
  status?: string;
  q?: string;
}

export const listMembersForWorkspace = async (
  input: ListMembersForWorkspaceInput,
): Promise<{ items: WorkspaceMemberRow[]; total: number }> => {
  const whereClauses = [eq(workspaceMemberships.workspaceId, input.workspaceId)];
  if (input.role) {
    whereClauses.push(eq(workspaceMemberships.role, input.role));
  }
  if (input.status) {
    whereClauses.push(eq(workspaceMemberships.status, input.status));
  }
  if (input.q) {
    whereClauses.push(ilike(appUsers.displayLabel, likePattern(input.q)));
  }

  const where = and(...whereClauses);

  return readListPage(async (tx) => {
    const items = await tx
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
      .where(where)
      .orderBy(...orderByForSort(MEMBER_SORT_COLUMNS, input.sort, workspaceMemberships.id))
      .limit(input.limit)
      .offset(input.offset);
    const totals = await tx
      .select({ total: count() })
      .from(workspaceMemberships)
      .innerJoin(appUsers, eq(appUsers.id, workspaceMemberships.userId))
      .where(where);
    return { items, total: totals[0]?.total ?? 0 };
  });
};
