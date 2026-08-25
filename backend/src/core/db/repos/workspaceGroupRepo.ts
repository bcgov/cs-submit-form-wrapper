import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, type DbOrTx } from '../client';
import {
  appUsers,
  identityProviders,
  workspaceGroupMemberships,
  workspaceGroupRoles,
  workspaceGroups,
  workspaceMemberships,
} from '../schema';
import {
  GroupMemberKind,
  PUBLIC_PROVIDER_CODE,
  WorkspaceGroupMembershipStatus,
  WorkspaceGroupRoleStatus,
  WorkspaceGroupStatus,
  WorkspaceMembershipStatus,
} from '../codes';

/** Insert rows for a group's role set; duplicate codes collapse to one row. */
const groupRoleRows = (args: {
  workspaceId: string;
  groupId: string;
  roleCodes: string[];
  displayLabel: string | null;
}) =>
  [...new Set(args.roleCodes)].map((roleCode) => ({
    id: uuidv7(),
    workspaceId: args.workspaceId,
    groupId: args.groupId,
    roleCode,
    status: WorkspaceGroupRoleStatus.active,
    createdBy: args.displayLabel,
    updatedBy: args.displayLabel,
  }));

/** A single identity-provider membership insert row. */
const idpMemberRow = (args: {
  workspaceId: string;
  groupId: string;
  code: string;
  displayLabel: string | null;
}) => ({
  id: uuidv7(),
  workspaceId: args.workspaceId,
  memberKind: GroupMemberKind.idp,
  identityProviderCode: args.code,
  groupId: args.groupId,
  status: WorkspaceGroupMembershipStatus.active,
  createdBy: args.displayLabel,
  updatedBy: args.displayLabel,
});

/** Creates a workspace group carrying the given roles; returns the new group id. */
export const createGroupWithRole = async (
  executor: DbOrTx,
  args: {
    workspaceId: string;
    name: string;
    roleCodes: string[];
    description?: string | null;
    systemCode?: string | null;
    displayLabel: string | null;
  },
): Promise<string> => {
  const groupId = uuidv7();
  await executor.insert(workspaceGroups).values({
    id: groupId,
    workspaceId: args.workspaceId,
    name: args.name,
    description: args.description ?? null,
    systemCode: args.systemCode ?? null,
    status: WorkspaceGroupStatus.active,
    createdBy: args.displayLabel,
    updatedBy: args.displayLabel,
  });
  if (args.roleCodes.length) {
    await executor.insert(workspaceGroupRoles).values(groupRoleRows({ ...args, groupId }));
  }
  return groupId;
};

/** Adds a workspace member (by membership id) to a group. */
export const addUserToGroup = async (
  executor: DbOrTx,
  args: { workspaceId: string; groupId: string; membershipId: string; displayLabel: string | null },
) => {
  await executor.insert(workspaceGroupMemberships).values({
    id: uuidv7(),
    workspaceId: args.workspaceId,
    workspaceMembershipId: args.membershipId,
    groupId: args.groupId,
    status: WorkspaceGroupMembershipStatus.active,
    createdBy: args.displayLabel,
    updatedBy: args.displayLabel,
  });
};

/** A group member: a workspace user, or (Form submitters only) an identity provider. */
export type WorkspaceGroupMember =
  | { id: string; kind: 'user'; membershipId: string; userId: string; displayLabel: string | null }
  | { id: string; kind: 'idp'; code: string; label: string };

export interface WorkspaceGroupRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  /** True for the two protected bootstrap groups (can't be deleted; roles can't change). */
  system: boolean;
  roles: string[];
  members: WorkspaceGroupMember[];
}

/** Active workspace groups with their role codes and members. Filter to one group with `groupId`. */
export const listWorkspaceGroups = async (
  workspaceId: string,
  groupId?: string,
): Promise<WorkspaceGroupRow[]> => {
  const groupWhere = and(
    eq(workspaceGroups.workspaceId, workspaceId),
    eq(workspaceGroups.status, WorkspaceGroupStatus.active),
    ...(groupId ? [eq(workspaceGroups.id, groupId)] : []),
  );
  const groups = await db
    .select({
      id: workspaceGroups.id,
      name: workspaceGroups.name,
      description: workspaceGroups.description,
      status: workspaceGroups.status,
      systemCode: workspaceGroups.systemCode,
    })
    .from(workspaceGroups)
    .where(groupWhere)
    .orderBy(asc(workspaceGroups.name));
  if (!groups.length) return [];

  const groupIds = groups.map((g) => g.id);

  const roleRows = await db
    .select({ groupId: workspaceGroupRoles.groupId, roleCode: workspaceGroupRoles.roleCode })
    .from(workspaceGroupRoles)
    .where(
      and(
        inArray(workspaceGroupRoles.groupId, groupIds),
        eq(workspaceGroupRoles.status, WorkspaceGroupRoleStatus.active),
      ),
    )
    .orderBy(asc(workspaceGroupRoles.roleCode));

  const userRows = await db
    .select({
      id: workspaceGroupMemberships.id,
      groupId: workspaceGroupMemberships.groupId,
      membershipId: workspaceGroupMemberships.workspaceMembershipId,
      userId: workspaceMemberships.userId,
      displayLabel: appUsers.displayLabel,
    })
    .from(workspaceGroupMemberships)
    .innerJoin(
      workspaceMemberships,
      eq(workspaceMemberships.id, workspaceGroupMemberships.workspaceMembershipId),
    )
    .innerJoin(appUsers, eq(appUsers.id, workspaceMemberships.userId))
    .where(
      and(
        inArray(workspaceGroupMemberships.groupId, groupIds),
        eq(workspaceGroupMemberships.memberKind, GroupMemberKind.user),
        eq(workspaceGroupMemberships.status, WorkspaceGroupMembershipStatus.active),
        eq(workspaceMemberships.status, WorkspaceMembershipStatus.active),
      ),
    )
    .orderBy(asc(appUsers.displayLabel));

  const idpRows = await db
    .select({
      id: workspaceGroupMemberships.id,
      groupId: workspaceGroupMemberships.groupId,
      code: workspaceGroupMemberships.identityProviderCode,
      label: identityProviders.name,
    })
    .from(workspaceGroupMemberships)
    .innerJoin(
      identityProviders,
      eq(identityProviders.code, workspaceGroupMemberships.identityProviderCode),
    )
    .where(
      and(
        inArray(workspaceGroupMemberships.groupId, groupIds),
        eq(workspaceGroupMemberships.memberKind, GroupMemberKind.idp),
        eq(workspaceGroupMemberships.status, WorkspaceGroupMembershipStatus.active),
      ),
    )
    .orderBy(asc(identityProviders.name));

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    status: g.status,
    system: g.systemCode != null,
    roles: roleRows.filter((r) => r.groupId === g.id).map((r) => r.roleCode),
    members: [
      ...userRows
        .filter((m) => m.groupId === g.id)
        .map(
          (m): WorkspaceGroupMember => ({
            id: m.id,
            kind: 'user',
            membershipId: m.membershipId as string,
            userId: m.userId,
            displayLabel: m.displayLabel,
          }),
        ),
      ...idpRows
        .filter((m) => m.groupId === g.id)
        .map(
          (m): WorkspaceGroupMember => ({
            id: m.id,
            kind: 'idp',
            code: m.code as string,
            label: m.label,
          }),
        ),
    ],
  }));
};

/** Single group with roles and members, or null if it isn't in the workspace. */
export const getWorkspaceGroup = async (
  workspaceId: string,
  groupId: string,
): Promise<WorkspaceGroupRow | null> => {
  const groups = await listWorkspaceGroups(workspaceId, groupId);
  return groups[0] ?? null;
};

/** The active group's `systemCode` (null for user-created groups), or null if it isn't in the workspace. */
export const getWorkspaceGroupMeta = async (
  workspaceId: string,
  groupId: string,
): Promise<{ systemCode: string | null } | null> => {
  const rows = await db
    .select({ systemCode: workspaceGroups.systemCode })
    .from(workspaceGroups)
    .where(
      and(
        eq(workspaceGroups.id, groupId),
        eq(workspaceGroups.workspaceId, workspaceId),
        eq(workspaceGroups.status, WorkspaceGroupStatus.active),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
};

/** The id of a workspace's active system group (e.g. form_submitters), or null. */
export const getSystemGroupId = async (
  workspaceId: string,
  systemCode: string,
): Promise<string | null> => {
  const rows = await db
    .select({ id: workspaceGroups.id })
    .from(workspaceGroups)
    .where(
      and(
        eq(workspaceGroups.workspaceId, workspaceId),
        eq(workspaceGroups.systemCode, systemCode),
        eq(workspaceGroups.status, WorkspaceGroupStatus.active),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
};

/**
 * Replaces a submitter group's public/idp audience in one transaction. `public` clears every member
 * (public is exclusive); otherwise the idp members are reconciled to `idps` — user members are left
 * untouched so a future direct-user audience isn't clobbered.
 */
export const setSubmitterAudience = async (args: {
  workspaceId: string;
  groupId: string;
  public: boolean;
  idps: string[];
  displayLabel: string | null;
}): Promise<void> => {
  await db.transaction(async (tx) => {
    if (args.public) {
      await tx
        .delete(workspaceGroupMemberships)
        .where(eq(workspaceGroupMemberships.groupId, args.groupId));
      await tx.insert(workspaceGroupMemberships).values(
        idpMemberRow({
          workspaceId: args.workspaceId,
          groupId: args.groupId,
          code: PUBLIC_PROVIDER_CODE,
          displayLabel: args.displayLabel,
        }),
      );
      return;
    }

    const current = await tx
      .select({ code: workspaceGroupMemberships.identityProviderCode })
      .from(workspaceGroupMemberships)
      .where(
        and(
          eq(workspaceGroupMemberships.groupId, args.groupId),
          eq(workspaceGroupMemberships.memberKind, GroupMemberKind.idp),
          eq(workspaceGroupMemberships.status, WorkspaceGroupMembershipStatus.active),
        ),
      );
    const currentCodes = current.map((r) => r.code).filter((c): c is string => c != null);
    const desired = new Set(args.idps);

    // Drop public and any idp no longer wanted; add the new ones. Users are left as-is.
    const toRemove = currentCodes.filter((c) => c === PUBLIC_PROVIDER_CODE || !desired.has(c));
    if (toRemove.length) {
      await tx
        .delete(workspaceGroupMemberships)
        .where(
          and(
            eq(workspaceGroupMemberships.groupId, args.groupId),
            eq(workspaceGroupMemberships.memberKind, GroupMemberKind.idp),
            inArray(workspaceGroupMemberships.identityProviderCode, toRemove),
          ),
        );
    }
    const currentSet = new Set(currentCodes);
    const toAdd = args.idps.filter((c) => !currentSet.has(c));
    if (toAdd.length) {
      await tx.insert(workspaceGroupMemberships).values(
        toAdd.map((code) =>
          idpMemberRow({
            workspaceId: args.workspaceId,
            groupId: args.groupId,
            code,
            displayLabel: args.displayLabel,
          }),
        ),
      );
    }
  });
};

/** The kind ('user'/'idp') of an active member row in the group, or null when it isn't present. */
export const activeGroupMemberKind = async (
  groupId: string,
  memberId: string,
): Promise<string | null> => {
  const rows = await db
    .select({ memberKind: workspaceGroupMemberships.memberKind })
    .from(workspaceGroupMemberships)
    .where(
      and(
        eq(workspaceGroupMemberships.id, memberId),
        eq(workspaceGroupMemberships.groupId, groupId),
        eq(workspaceGroupMemberships.status, WorkspaceGroupMembershipStatus.active),
      ),
    )
    .limit(1);
  return rows[0]?.memberKind ?? null;
};

/** Count of active `user` members whose workspace membership is also active. */
export const countActiveUserMembers = async (groupId: string): Promise<number> => {
  const rows = await db
    .select({ id: workspaceGroupMemberships.id })
    .from(workspaceGroupMemberships)
    .innerJoin(
      workspaceMemberships,
      eq(workspaceMemberships.id, workspaceGroupMemberships.workspaceMembershipId),
    )
    .where(
      and(
        eq(workspaceGroupMemberships.groupId, groupId),
        eq(workspaceGroupMemberships.memberKind, GroupMemberKind.user),
        eq(workspaceGroupMemberships.status, WorkspaceGroupMembershipStatus.active),
        eq(workspaceMemberships.status, WorkspaceMembershipStatus.active),
      ),
    );
  return rows.length;
};

/** True if an active group with this name exists in the workspace (optionally excluding one group). */
export const groupNameExistsInWorkspace = async (
  workspaceId: string,
  name: string,
  exceptGroupId?: string,
): Promise<boolean> => {
  const rows = await db
    .select({ id: workspaceGroups.id })
    .from(workspaceGroups)
    .where(
      and(
        eq(workspaceGroups.workspaceId, workspaceId),
        eq(workspaceGroups.name, name),
        eq(workspaceGroups.status, WorkspaceGroupStatus.active),
        ...(exceptGroupId ? [ne(workspaceGroups.id, exceptGroupId)] : []),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
};

/** True if the membership id is an active member of the workspace. */
export const membershipInWorkspace = async (
  workspaceId: string,
  membershipId: string,
): Promise<boolean> => {
  const rows = await db
    .select({ id: workspaceMemberships.id })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.id, membershipId),
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.status, WorkspaceMembershipStatus.active),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
};

/** True if the membership is already a `user` member of the group. */
export const isUserInGroup = async (groupId: string, membershipId: string): Promise<boolean> => {
  const rows = await db
    .select({ id: workspaceGroupMemberships.id })
    .from(workspaceGroupMemberships)
    .where(
      and(
        eq(workspaceGroupMemberships.groupId, groupId),
        eq(workspaceGroupMemberships.workspaceMembershipId, membershipId),
        eq(workspaceGroupMemberships.memberKind, GroupMemberKind.user),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
};

/** Creates a group carrying the given roles; returns the new group id. */
export const createWorkspaceGroup = async (args: {
  workspaceId: string;
  name: string;
  description?: string | null;
  roleCodes: string[];
  displayLabel: string | null;
}): Promise<string> => db.transaction((tx) => createGroupWithRole(tx, args));

/** Replaces a group's role set with `roleCodes`. */
export const replaceGroupRoles = async (args: {
  workspaceId: string;
  groupId: string;
  roleCodes: string[];
  displayLabel: string | null;
}): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx.delete(workspaceGroupRoles).where(eq(workspaceGroupRoles.groupId, args.groupId));
    if (args.roleCodes.length) {
      await tx.insert(workspaceGroupRoles).values(groupRoleRows(args));
    }
  });
};

/** Adds a workspace member to a group. */
export const addGroupMember = async (args: {
  workspaceId: string;
  groupId: string;
  membershipId: string;
  displayLabel: string | null;
}): Promise<void> => {
  await addUserToGroup(db, args);
};

/** Adds an identity-provider member to a group (executor lets it join a bootstrap transaction). */
export const addIdpToGroup = async (
  executor: DbOrTx,
  args: { workspaceId: string; groupId: string; code: string; displayLabel: string | null },
): Promise<void> => {
  await executor.insert(workspaceGroupMemberships).values(idpMemberRow(args));
};

export const addGroupIdpMember = (args: {
  workspaceId: string;
  groupId: string;
  code: string;
  displayLabel: string | null;
}): Promise<void> => addIdpToGroup(db, args);

/** Removes a member (any kind) from a group by its row id; false when it wasn't present. */
export const removeGroupMember = async (args: {
  groupId: string;
  memberId: string;
}): Promise<boolean> => {
  const rows = await db
    .delete(workspaceGroupMemberships)
    .where(
      and(
        eq(workspaceGroupMemberships.id, args.memberId),
        eq(workspaceGroupMemberships.groupId, args.groupId),
      ),
    )
    .returning({ id: workspaceGroupMemberships.id });
  return rows.length > 0;
};

/** Total active members (any kind) in a group. */
export const countGroupMembers = async (groupId: string): Promise<number> => {
  const rows = await db
    .select({ id: workspaceGroupMemberships.id })
    .from(workspaceGroupMemberships)
    .where(
      and(
        eq(workspaceGroupMemberships.groupId, groupId),
        eq(workspaceGroupMemberships.status, WorkspaceGroupMembershipStatus.active),
      ),
    );
  return rows.length;
};

/** True if the group has the given identity provider as an active member. */
export const hasIdpMember = async (groupId: string, code: string): Promise<boolean> => {
  const rows = await db
    .select({ id: workspaceGroupMemberships.id })
    .from(workspaceGroupMemberships)
    .where(
      and(
        eq(workspaceGroupMemberships.groupId, groupId),
        eq(workspaceGroupMemberships.memberKind, GroupMemberKind.idp),
        eq(workspaceGroupMemberships.identityProviderCode, code),
        eq(workspaceGroupMemberships.status, WorkspaceGroupMembershipStatus.active),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
};

/** Updates a group's name and/or description. */
export const renameGroup = async (args: {
  groupId: string;
  name?: string;
  description?: string | null;
  displayLabel: string | null;
}): Promise<void> => {
  const set: {
    name?: string;
    description?: string | null;
    updatedBy: string | null;
    updatedAt: Date;
  } = {
    updatedBy: args.displayLabel,
    updatedAt: new Date(),
  };
  if (args.name !== undefined) set.name = args.name;
  if (args.description !== undefined) set.description = args.description;
  await db.update(workspaceGroups).set(set).where(eq(workspaceGroups.id, args.groupId));
};

/**
 * Soft-deletes a group: deactivates the group and its roles and memberships in one transaction, so
 * the permission resolver (which filters on active roles/memberships) stops granting through it.
 */
export const softDeleteWorkspaceGroup = async (args: {
  groupId: string;
  displayLabel: string | null;
}): Promise<void> => {
  const stamp = { updatedBy: args.displayLabel, updatedAt: new Date() };
  await db.transaction(async (tx) => {
    await tx
      .update(workspaceGroupMemberships)
      .set({ status: WorkspaceGroupMembershipStatus.inactive, ...stamp })
      .where(eq(workspaceGroupMemberships.groupId, args.groupId));
    await tx
      .update(workspaceGroupRoles)
      .set({ status: WorkspaceGroupRoleStatus.inactive, ...stamp })
      .where(eq(workspaceGroupRoles.groupId, args.groupId));
    await tx
      .update(workspaceGroups)
      .set({ status: WorkspaceGroupStatus.inactive, ...stamp })
      .where(eq(workspaceGroups.id, args.groupId));
  });
};
