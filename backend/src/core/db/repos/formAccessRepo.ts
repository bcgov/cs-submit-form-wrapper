import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../client';
import {
  rolePermissions,
  workspaceGroupMemberships,
  workspaceGroupRoles,
  workspaceMemberships,
} from '../schema';
import {
  GroupMemberKind,
  Permissions,
  WorkspaceGroupMembershipStatus,
  WorkspaceGroupRoleStatus,
  WorkspaceMembershipStatus,
} from '../codes';
import { getWorkspaceIdForForm } from './formRepo';

/**
 * Permission codes the user holds across a workspace's forms, from the roles of the workspace groups
 * they belong to. A returned set containing '*' grants everything. Resolves 'user' group members only.
 */
export const resolveFormPermissions = async (
  actorId: string,
  workspaceId: string,
): Promise<Set<string>> => {
  const rows = await db
    .selectDistinct({ permissionCode: rolePermissions.permissionCode })
    .from(workspaceGroupMemberships)
    .innerJoin(
      workspaceGroupRoles,
      eq(workspaceGroupRoles.groupId, workspaceGroupMemberships.groupId),
    )
    .innerJoin(rolePermissions, eq(rolePermissions.roleCode, workspaceGroupRoles.roleCode))
    .innerJoin(
      workspaceMemberships,
      eq(workspaceMemberships.id, workspaceGroupMemberships.workspaceMembershipId),
    )
    .where(
      and(
        eq(workspaceGroupMemberships.workspaceId, workspaceId),
        eq(workspaceGroupMemberships.memberKind, GroupMemberKind.user),
        eq(workspaceGroupMemberships.status, WorkspaceGroupMembershipStatus.active),
        eq(workspaceGroupRoles.status, WorkspaceGroupRoleStatus.active),
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, actorId),
        eq(workspaceMemberships.status, WorkspaceMembershipStatus.active),
      ),
    );

  return new Set(rows.map((row) => row.permissionCode));
};

/** Permission codes the user holds on a specific form, resolved via the form's workspace. */
export const effectiveFormPermissions = async (
  actorId: string,
  formId: string,
): Promise<Set<string>> => {
  const workspaceId = await getWorkspaceIdForForm(formId);
  if (!workspaceId) return new Set();
  return resolveFormPermissions(actorId, workspaceId);
};

/** True if `perms` satisfies every required code, honoring the `*` wildcard. */
export const hasAllPermissions = (perms: Set<string>, required: readonly string[]): boolean => {
  if (perms.has(Permissions.all)) return true;
  return required.every((code) => perms.has(code));
};

/** Fetch all active workspaces for the actor where they hold the required permissions. */
export const getWorkspaceIdsWithAllPermissions = async (
  actorId: string,
  required: readonly string[],
): Promise<string[]> => {
  const activeMembership = and(
    eq(workspaceMemberships.userId, actorId),
    eq(workspaceMemberships.status, WorkspaceMembershipStatus.active),
  );

  // No required codes: every active membership qualifies.
  if (required.length === 0) {
    const rows = await db
      .select({ workspaceId: workspaceMemberships.workspaceId })
      .from(workspaceMemberships)
      .where(activeMembership);
    return rows.map((row) => row.workspaceId);
  }

  // A workspace qualifies on the wildcard, or on all required codes across the actor's groups.
  const requiredCodes = [...required];
  const rows = await db
    .select({ workspaceId: workspaceMemberships.workspaceId })
    .from(workspaceMemberships)
    .innerJoin(
      workspaceGroupMemberships,
      and(
        eq(workspaceGroupMemberships.workspaceMembershipId, workspaceMemberships.id),
        eq(workspaceGroupMemberships.workspaceId, workspaceMemberships.workspaceId),
        eq(workspaceGroupMemberships.memberKind, GroupMemberKind.user),
        eq(workspaceGroupMemberships.status, WorkspaceGroupMembershipStatus.active),
      ),
    )
    .innerJoin(
      workspaceGroupRoles,
      and(
        eq(workspaceGroupRoles.groupId, workspaceGroupMemberships.groupId),
        eq(workspaceGroupRoles.status, WorkspaceGroupRoleStatus.active),
      ),
    )
    .innerJoin(rolePermissions, eq(rolePermissions.roleCode, workspaceGroupRoles.roleCode))
    .where(activeMembership)
    .groupBy(workspaceMemberships.workspaceId)
    .having(
      sql`bool_or(${eq(rolePermissions.permissionCode, Permissions.all)}) or count(distinct ${rolePermissions.permissionCode}) filter (where ${inArray(rolePermissions.permissionCode, requiredCodes)}) = ${requiredCodes.length}`,
    );

  return rows.map((row) => row.workspaceId);
};
