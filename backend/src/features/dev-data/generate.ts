/**
 * Runs the plan through the real services, so forms and submissions exist in Postgres and in the
 * form engine. No argv, console, or process exit: takes options, returns a manifest.
 */
import { v7 as uuidv7 } from 'uuid';

import { db } from '../../core/db/client';
import { workspaceMemberships } from '../../core/db/schema';
import {
  SystemGroup,
  WorkspaceMembershipSource,
  WorkspaceMembershipStatus,
  type WorkspaceMembershipRoleCode,
} from '../../core/db/codes';
import { ConflictError } from '../../core/errors';
import { createTeamWorkspace } from '../../core/db/repos/workspaceRepo';
import {
  findOrCreateUserByIdentity,
  invalidateMembershipCache,
} from '../../core/db/repos/membershipRepo';
import {
  addUserToGroup,
  createGroupWithRole,
  getSystemGroupId,
  setSubmitterAudience,
} from '../../core/db/repos/workspaceGroupRepo';
import { FormService } from '../../core/services/formService';
import { FormVersionService } from '../../core/services/formVersionService';
import { SubmissionService } from '../../core/services/submissionService';

import { getFixture, type DevFormFixture } from './fixtures';
import {
  buildPlan,
  DEFAULT_SIZE,
  type PlannedForm,
  type PlannedSubmission,
  type PlannedAudience,
  type PlannedSubmitter,
  type PlannedWorkspace,
  type PlannedUser,
  type SizeName,
} from './plan';
import { requireBaseSeed } from './preconditions';
import { finishRun, hasOpenRun, recordIds, startRun } from './runs';
import { resolveTargetUser, type ResolvedUser, type UserRef } from './resolveUser';

// Not from the core container, which also wires the API service layer this tool does not use.
const formService = new FormService();
const formVersionService = new FormVersionService();
const submissionService = new SubmissionService();

export interface GenerateOptions {
  /** The real user the data is built around. */
  user: UserRef;
  /** Rows in the biggest collections. Defaults to 'large'. */
  size?: SizeName;
  /** Attribute some submissions to the seeded public user. */
  includeAnonymousSubmissions?: boolean;
}

export interface ManifestForm {
  id: string;
  name: string;
  published: boolean;
  submissionIds: string[];
}

export interface ManifestWorkspace {
  id: string;
  name: string;
  /** Role the target user holds, or null when they are not a member. */
  targetUserRole: WorkspaceMembershipRoleCode | null;
  disclaimerAccepted: boolean;
  audience: PlannedAudience;
  memberCount: number;
  forms: ManifestForm[];
}

export interface DevDataManifest {
  generatedAt: string;
  size: SizeName;
  owner: ResolvedUser;
  anchors: {
    pagingForms: string | null;
    pagingMembers: string | null;
    pagingSubmissions: { workspaceId: string; formId: string } | null;
  };
  users: Array<{ id: string; displayLabel: string; identityProviderCode: string }>;
  workspaces: ManifestWorkspace[];
  counts: Record<string, number>;
}

interface GenerateContext {
  runId: string;
  target: ResolvedUser;
  /** Dev users keyed by plan index. */
  users: Map<number, ResolvedUser>;
  publicUser: ResolvedUser;
  includeAnonymous: boolean;
}

/** A second set would collide on the unique names. An unfinished run counts as present. */
async function assertNoExistingDevData(): Promise<void> {
  if (await hasOpenRun()) {
    throw new ConflictError('Dev data is already present; purge it before generating again');
  }
}

async function createUsers(
  plannedUsers: PlannedUser[],
  runId: string,
): Promise<Map<number, ResolvedUser>> {
  const users = new Map<number, ResolvedUser>();
  for (const planned of plannedUsers) {
    const id = await findOrCreateUserByIdentity(
      planned.identityProviderCode,
      planned.subject,
      planned.profile,
    );
    // Recorded one at a time: a failure part way through must not orphan the ones already made.
    await recordIds(runId, { userIds: [id] });
    users.set(planned.index, { id, displayLabel: planned.displayLabel });
  }
  return users;
}

function requireUser(ctx: GenerateContext, index: number): ResolvedUser {
  const user = ctx.users.get(index);
  if (!user) throw new Error(`Dev user ${index} was not created`);
  return user;
}

const ownerOf = (ctx: GenerateContext, planned: PlannedWorkspace): ResolvedUser =>
  planned.ownerUserIndex == null ? ctx.target : requireUser(ctx, planned.ownerUserIndex);

/** Written directly: the members API is read-only and the owner bootstrap is private. */
async function addMember(args: {
  workspaceId: string;
  user: ResolvedUser;
  role: WorkspaceMembershipRoleCode;
  invitedBy: ResolvedUser;
}): Promise<string> {
  const membershipId = uuidv7();
  const now = new Date();
  await db.insert(workspaceMemberships).values({
    id: membershipId,
    workspaceId: args.workspaceId,
    userId: args.user.id,
    role: args.role,
    status: WorkspaceMembershipStatus.active,
    source: WorkspaceMembershipSource.user_created,
    invitedByUserId: args.invitedBy.id,
    invitedAt: now,
    acceptedAt: now,
    createdBy: args.invitedBy.displayLabel,
    updatedBy: args.invitedBy.displayLabel,
  });
  // The cache is process-local, so a long-lived API process would otherwise miss this row.
  invalidateMembershipCache(args.workspaceId, args.user.id);
  return membershipId;
}

/** Memberships for the target user when they are not the owner, plus every planned dev member. */
async function addMembers(
  ctx: GenerateContext,
  workspaceId: string,
  planned: PlannedWorkspace,
  owner: ResolvedUser,
): Promise<{ dev: Map<number, string>; target: string | null }> {
  const dev = new Map<number, string>();
  let target: string | null = null;

  if (planned.ownerUserIndex != null && planned.targetUserRole) {
    target = await addMember({
      workspaceId,
      user: ctx.target,
      role: planned.targetUserRole,
      invitedBy: owner,
    });
  }

  for (const member of planned.members) {
    const membershipId = await addMember({
      workspaceId,
      user: requireUser(ctx, member.userIndex),
      role: member.role,
      invitedBy: owner,
    });
    dev.set(member.userIndex, membershipId);
  }
  return { dev, target };
}

/** Bootstrap already produces 'protected', so only the other modes need work. */
async function applyAudience(
  workspaceId: string,
  planned: PlannedWorkspace,
  owner: ResolvedUser,
): Promise<void> {
  if (planned.audience === 'protected') return;
  const groupId = await getSystemGroupId(workspaceId, SystemGroup.form_submitters);
  if (!groupId) return;
  await setSubmitterAudience({
    workspaceId,
    groupId,
    public: planned.audience === 'public',
    idps: [],
    displayLabel: owner.displayLabel,
  });
}

/** One transaction per workspace: a group and its members belong together. */
async function createGroups(
  workspaceId: string,
  planned: PlannedWorkspace,
  memberships: { dev: Map<number, string>; target: string | null },
  owner: ResolvedUser,
): Promise<void> {
  const displayLabel = owner.displayLabel;

  await db.transaction(async (tx) => {
    for (const group of planned.groups) {
      const groupId = await createGroupWithRole(tx, {
        workspaceId,
        name: group.name,
        roleCodes: [...group.roleCodes],
        displayLabel,
      });
      for (const userIndex of group.memberUserIndexes) {
        const membershipId = memberships.dev.get(userIndex);
        if (!membershipId) throw new Error(`No membership for dev user ${userIndex}`);
        await addUserToGroup(tx, { workspaceId, groupId, membershipId, displayLabel });
      }
    }

    // Without this the target user's workspace role grants no form access at all.
    if (planned.targetGroup && memberships.target) {
      const groupId = await createGroupWithRole(tx, {
        workspaceId,
        name: planned.targetGroup.name,
        roleCodes: [...planned.targetGroup.roleCodes],
        displayLabel,
      });
      await addUserToGroup(tx, {
        workspaceId,
        groupId,
        membershipId: memberships.target,
        displayLabel,
      });
    }
  });
}

/** With anonymous off the row is still created, attributed to the target: the planned counts are
 *  what the paging anchors depend on. */
function submitterOf(ctx: GenerateContext, submitter: PlannedSubmitter): ResolvedUser {
  if (submitter.kind === 'target') return ctx.target;
  if (submitter.kind === 'devUser') return requireUser(ctx, submitter.userIndex);
  return ctx.includeAnonymous ? ctx.publicUser : ctx.target;
}

async function createSubmission(args: {
  ctx: GenerateContext;
  workspaceId: string;
  formId: string;
  fixture: DevFormFixture;
  planned: PlannedSubmission;
}): Promise<string> {
  const actor = submitterOf(args.ctx, args.planned.submitter);
  const submissionId = uuidv7();
  const actorInput = { actorId: actor.id, actorDisplayLabel: actor.displayLabel };
  await submissionService.open({
    id: submissionId,
    workspaceId: args.workspaceId,
    formId: args.formId,
    ...actorInput,
  });

  const data = args.fixture.answers(args.planned.index);
  for (const event of args.planned.events) {
    const input = { workspaceId: args.workspaceId, submissionId, data, ...actorInput };
    await (event === 'saved' ? submissionService.save(input) : submissionService.submit(input));
  }
  return submissionId;
}

async function createForm(
  ctx: GenerateContext,
  workspaceId: string,
  planned: PlannedForm,
  owner: ResolvedUser,
): Promise<ManifestForm> {
  const actor = { actorId: owner.id, actorDisplayLabel: owner.displayLabel };
  const fixture = getFixture(planned.fixtureCode);

  const { form, version } = await formService.create({
    workspaceId,
    name: planned.name,
    description: planned.description,
    ...actor,
  });

  if (planned.provisioned) {
    await formVersionService.provision({
      workspaceId,
      formVersionId: version.id,
      schema: fixture.schema,
      ...actor,
    });
  }
  if (planned.published) {
    await formVersionService.publish({ workspaceId, formVersionId: version.id, ...actor });
  }

  const submissionIds: string[] = [];
  for (const submission of planned.submissions) {
    submissionIds.push(
      await createSubmission({ ctx, workspaceId, formId: form.id, fixture, planned: submission }),
    );
  }

  return { id: form.id, name: planned.name, published: planned.published, submissionIds };
}

async function createWorkspace(
  ctx: GenerateContext,
  planned: PlannedWorkspace,
): Promise<ManifestWorkspace> {
  const owner = ownerOf(ctx, planned);
  // One transaction: an unrecorded workspace would block every later seed on its deterministic
  // name, with no way for purge to reach it. Committing the row and its record together means
  // neither can exist without the other.
  const workspaceId = await db.transaction(async (tx) => {
    const id = await createTeamWorkspace(
      owner.id,
      planned.name,
      planned.org,
      planned.useCase,
      planned.disclaimerAccepted,
      tx,
    );
    await recordIds(ctx.runId, { workspaceIds: [id] }, tx);
    return id;
  });

  const memberships = await addMembers(ctx, workspaceId, planned, owner);
  await applyAudience(workspaceId, planned, owner);
  await createGroups(workspaceId, planned, memberships, owner);

  const forms: ManifestForm[] = [];
  for (const plannedForm of planned.forms) {
    forms.push(await createForm(ctx, workspaceId, plannedForm, owner));
  }

  return {
    id: workspaceId,
    name: planned.name,
    targetUserRole: planned.targetUserRole,
    disclaimerAccepted: planned.disclaimerAccepted,
    audience: planned.audience,
    // Planned dev members, plus the target user's row, plus the owner's own row.
    memberCount:
      planned.members.length +
      (planned.targetUserRole ? 1 : 0) +
      (planned.ownerUserIndex != null ? 1 : 0),
    forms,
  };
}

function buildAnchors(
  plan: ReturnType<typeof buildPlan>,
  created: ManifestWorkspace[],
): DevDataManifest['anchors'] {
  const idFor = (anchor: string): ManifestWorkspace | null => {
    const index = plan.workspaces.findIndex((w) => w.anchor === anchor);
    return index === -1 ? null : (created[index] ?? null);
  };
  const submissions = idFor('pagingSubmissions');
  return {
    pagingForms: idFor('pagingForms')?.id ?? null,
    pagingMembers: idFor('pagingMembers')?.id ?? null,
    pagingSubmissions: submissions?.forms[0]
      ? { workspaceId: submissions.id, formId: submissions.forms[0].id }
      : null,
  };
}

function countRows(workspaces: ManifestWorkspace[], userCount: number): Record<string, number> {
  const forms = workspaces.flatMap((w) => w.forms);
  return {
    users: userCount,
    workspaces: workspaces.length,
    forms: forms.length,
    publishedForms: forms.filter((f) => f.published).length,
    submissions: forms.reduce((total, f) => total + f.submissionIds.length, 0),
  };
}

/** Build the data set. Fails if one is already present. */
export async function generate(options: GenerateOptions): Promise<DevDataManifest> {
  // Environment, then caller input, then state. Out of order these report the wrong problem.
  const publicUser = await requireBaseSeed();
  const target = await resolveTargetUser(options.user);
  await assertNoExistingDevData();

  const size = options.size ?? DEFAULT_SIZE;
  const plan = buildPlan(size);
  // Recorded before anything is written, so a run that dies part-way is still visible.
  const runId = await startRun({ size, ownerUserId: target.id, stampedBy: target.displayLabel });

  const ctx: GenerateContext = {
    runId,
    target,
    users: await createUsers(plan.users, runId),
    publicUser,
    includeAnonymous: options.includeAnonymousSubmissions ?? true,
  };

  // Created newest-first so the anchors, which the plan puts at indices 0-2, get the highest ids
  // and lead the default id:desc list instead of trailing it. Written back by plan index, so the
  // manifest still lines up with the plan.
  const created: ManifestWorkspace[] = new Array(plan.workspaces.length);
  for (const planned of [...plan.workspaces].reverse()) {
    created[planned.index] = await createWorkspace(ctx, planned);
  }

  const manifest: DevDataManifest = {
    generatedAt: new Date().toISOString(),
    size,
    owner: target,
    anchors: buildAnchors(plan, created),
    users: plan.users.map((u) => ({
      id: requireUser(ctx, u.index).id,
      displayLabel: u.displayLabel,
      identityProviderCode: u.identityProviderCode,
    })),
    workspaces: created,
    counts: countRows(created, ctx.users.size),
  };

  await finishRun(runId, manifest, target.displayLabel);
  return manifest;
}
