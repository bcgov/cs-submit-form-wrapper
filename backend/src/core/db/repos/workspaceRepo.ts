import { and, eq, ne } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
  FORM_ADMINS_GROUP_NAME,
  FORM_SUBMITTERS_GROUP_NAME,
  Roles,
  SystemGroup,
  WorkspaceKind,
  WorkspaceMembershipRole,
  WorkspaceMembershipSource,
  WorkspaceMembershipStatus,
  WorkspaceStatus,
} from '../codes';
import { env } from '../../config/env';
import { db, type DbOrTx } from '../client';
import {
  appUsers,
  workspaceDisclaimerAcceptances,
  workspaceMemberships,
  workspaces,
} from '../schema';
import { ConflictError } from '../../errors';
import { WORKSPACE_NAME_TAKEN } from '../../messages';
import {
  getWorkspaceForUser,
  invalidateMembershipCache,
  isWorkspaceManageRole,
} from './membershipRepo';
import { addIdpToGroup, addUserToGroup, createGroupWithRole } from './workspaceGroupRepo';
import { getIdentityProvider } from './identityProviderRepo';

/** True if a workspace of this kind already uses this name (optionally excluding one workspace). */
const workspaceNameExistsForKind = async (
  kind: string,
  name: string,
  exceptId?: string,
): Promise<boolean> => {
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.kind, kind),
        eq(workspaces.name, name),
        ...(exceptId ? [ne(workspaces.id, exceptId)] : []),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
};

/** Returns the workspace's id if it exists, otherwise null. Used to distinguish 404 from 403. */
export const getWorkspaceById = async (workspaceId: string): Promise<{ id: string } | null> => {
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return rows[0] ?? null;
};

const bootstrapWorkspaceOwner = async (
  tx: DbOrTx,
  workspaceId: string,
  userId: string,
  displayLabel: string | null,
  source: string,
) => {
  const membershipId = uuidv7();
  await tx.insert(workspaceMemberships).values({
    id: membershipId,
    workspaceId,
    userId,
    role: WorkspaceMembershipRole.owner,
    status: WorkspaceMembershipStatus.active,
    source,
    acceptedAt: new Date(),
    createdBy: displayLabel,
    updatedBy: displayLabel,
  });

  const formAdminsGroupId = await createGroupWithRole(tx, {
    workspaceId,
    name: FORM_ADMINS_GROUP_NAME,
    roleCodes: [Roles.form_admin],
    systemCode: SystemGroup.form_admins,
    displayLabel,
  });
  await addUserToGroup(tx, { workspaceId, groupId: formAdminsGroupId, membershipId, displayLabel });

  // Submitters default to protected by the standard login provider; the audience is editable later.
  const formSubmittersGroupId = await createGroupWithRole(tx, {
    workspaceId,
    name: FORM_SUBMITTERS_GROUP_NAME,
    roleCodes: [Roles.form_submitter],
    systemCode: SystemGroup.form_submitters,
    displayLabel,
  });
  // Only seed the default audience when the provider is a usable login provider; a missing/disabled
  // one just leaves the audience unset rather than failing workspace creation.
  const submitterProvider = env.getDefaultSubmitterProvider();
  const defaultProvider = await getIdentityProvider(submitterProvider);
  if (defaultProvider?.isActive && defaultProvider.isLoginProvider) {
    await addIdpToGroup(tx, {
      workspaceId,
      groupId: formSubmittersGroupId,
      code: submitterProvider,
      displayLabel,
    });
  }

  invalidateMembershipCache(workspaceId, userId);
};

/**
 * Creates a user-owned team workspace: owner membership plus the form-admin and form-submitter groups,
 * optionally recording the creator's disclaimer acceptance in the same transaction.
 */
export const createTeamWorkspace = async (
  userId: string,
  name: string,
  org: string,
  useCase: string,
  disclaimerAccepted = false,
  tx?: DbOrTx,
) => {
  if (await workspaceNameExistsForKind(WorkspaceKind.team, name)) {
    throw new ConflictError(WORKSPACE_NAME_TAKEN);
  }
  const run = async (d: DbOrTx) => {
    const workspaceId = uuidv7();
    const userRow = await d
      .select({ displayLabel: appUsers.displayLabel })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);
    const displayLabel = userRow[0]?.displayLabel ?? null;

    await d.insert(workspaces).values({
      id: workspaceId,
      kind: WorkspaceKind.team,
      name,
      org,
      useCase,
      status: WorkspaceStatus.active,
      createdBy: displayLabel,
      updatedBy: displayLabel,
    });

    await bootstrapWorkspaceOwner(
      d,
      workspaceId,
      userId,
      displayLabel,
      WorkspaceMembershipSource.user_created,
    );

    if (disclaimerAccepted) {
      await d.insert(workspaceDisclaimerAcceptances).values({
        workspaceId,
        acceptedByUserId: userId,
        acceptedAt: new Date(),
        createdBy: displayLabel,
        updatedBy: displayLabel,
      });
    }

    return workspaceId;
  };

  // Joins the caller's transaction when given one, so the caller can commit this alongside its own
  // writes. Opens its own otherwise.
  return tx ? run(tx) : db.transaction(run);
};

/** True once the workspace's disclaimer has been accepted (gates form creation). */
export const isWorkspaceDisclaimerAccepted = async (workspaceId: string): Promise<boolean> => {
  const rows = await db
    .select({ workspaceId: workspaceDisclaimerAcceptances.workspaceId })
    .from(workspaceDisclaimerAcceptances)
    .where(eq(workspaceDisclaimerAcceptances.workspaceId, workspaceId))
    .limit(1);
  return Boolean(rows[0]);
};

const setWorkspaceDisclaimer = async (
  executor: DbOrTx,
  workspaceId: string,
  actorId: string,
  displayLabel: string | null,
  accepted: boolean,
): Promise<void> => {
  if (!accepted) {
    await executor
      .delete(workspaceDisclaimerAcceptances)
      .where(eq(workspaceDisclaimerAcceptances.workspaceId, workspaceId));
    return;
  }
  const now = new Date();
  await executor
    .insert(workspaceDisclaimerAcceptances)
    .values({
      workspaceId,
      acceptedByUserId: actorId,
      acceptedAt: now,
      createdBy: displayLabel,
      updatedBy: displayLabel,
    })
    .onConflictDoUpdate({
      target: workspaceDisclaimerAcceptances.workspaceId,
      set: { acceptedByUserId: actorId, acceptedAt: now, updatedBy: displayLabel, updatedAt: now },
    });
};

/** Updates a workspace's name and/or disclaimer acceptance; false when the actor can't manage it. */
export const updateWorkspace = async (
  workspaceId: string,
  actorId: string,
  input: { name?: string; org?: string; useCase?: string; disclaimerAccepted?: boolean },
): Promise<boolean> => {
  const membership = await getWorkspaceForUser(workspaceId, actorId);
  if (!membership || !isWorkspaceManageRole(membership.role)) return false;

  const userRow = await db
    .select({ displayLabel: appUsers.displayLabel })
    .from(appUsers)
    .where(eq(appUsers.id, actorId))
    .limit(1);
  const displayLabel = userRow[0]?.displayLabel ?? null;

  if (input.name !== undefined) {
    if (await workspaceNameExistsForKind(membership.kind, input.name, workspaceId)) {
      throw new ConflictError(WORKSPACE_NAME_TAKEN);
    }
  }

  await db.transaction(async (tx) => {
    if (input.name !== undefined || input.org !== undefined || input.useCase !== undefined) {
      const updates: Record<string, unknown> = { updatedBy: displayLabel, updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.org !== undefined) updates.org = input.org;
      if (input.useCase !== undefined) updates.useCase = input.useCase;

      await tx.update(workspaces).set(updates).where(eq(workspaces.id, workspaceId));
    }
    if (input.disclaimerAccepted !== undefined) {
      await setWorkspaceDisclaimer(
        tx,
        workspaceId,
        actorId,
        displayLabel,
        input.disclaimerAccepted,
      );
    }
  });

  return true;
};
