/** What the generator creates, as data. No DB, no engine, no clock. */
import type { NormalizedProfile } from '../../core/auth/jwtClaims';
import {
  Roles,
  WorkspaceMembershipRole,
  type RoleCode,
  type WorkspaceMembershipRoleCode,
} from '../../core/db/codes';
import { fixtureAt, PAGING_FIXTURE_CODE } from './fixtures';

/** Name prefix on every generated row, so generated data is obvious in the UI. */
export const DEV_PREFIX = '[dev] ';

/** Subject prefix on generated identities. No real IdP mints one, so they cannot collide. */
export const DEV_SUBJECT_PREFIX = 'dev-data:';

/** Rows in the biggest collections: one more than a page size (5/10/20), so lists span two pages. */
export const SIZES = { small: 6, medium: 11, large: 21 } as const;

export type SizeName = keyof typeof SIZES;

export const SIZE_NAMES = Object.keys(SIZES) as SizeName[];

export const DEFAULT_SIZE: SizeName = 'large';

/** Counts derived from the chosen size. */
interface Sizing {
  size: SizeName;
  /** Rows in the anchored collections. */
  max: number;
  memberWorkspaces: number;
  nonMemberWorkspaces: number;
  workspaceCount: number;
  /** Modulus bounding forms per ordinary workspace. */
  formSpread: number;
  /** Modulus bounding submissions per ordinary form. */
  submissionSpread: number;
  /** Modulus bounding dev members per ordinary workspace. */
  memberSpread: number;
  roles: { owner: number; secondary: number };
}

/** Scale a large-set constant to this size. */
const scaled = (max: number, atLarge: number, floor = 2): number =>
  Math.max(floor, Math.ceil((max * atLarge) / SIZES.large));

function sizingFor(size: SizeName): Sizing {
  const max = SIZES[size];
  // admin/member/viewer take an equal slice, owner takes the rest.
  const secondary = Math.max(1, Math.ceil(max / 7));
  const nonMemberWorkspaces = Math.max(1, Math.floor(max / 7));
  return {
    size,
    max,
    memberWorkspaces: max,
    nonMemberWorkspaces,
    workspaceCount: max + nonMemberWorkspaces,
    formSpread: scaled(max, 6),
    submissionSpread: scaled(max, 8),
    memberSpread: scaled(max, 4),
    roles: { owner: max - 3 * secondary, secondary },
  };
}

/** Form submitters group setup. 'protected' is the bootstrap default. */
export type PlannedAudience = 'public' | 'protected' | 'none';

export type PlannedSubmitter =
  | { kind: 'target' }
  | { kind: 'devUser'; userIndex: number }
  | { kind: 'anonymous' };

export interface PlannedSubmission {
  index: number;
  /** Events applied after open, in order. Empty leaves it 'opened'. */
  events: Array<'saved' | 'submitted'>;
  submitter: PlannedSubmitter;
}

export interface PlannedForm {
  index: number;
  name: string;
  description: string;
  fixtureCode: string;
  /** False leaves the version at engineSyncStatus 'pending' with no schema ref. */
  provisioned: boolean;
  published: boolean;
  submissions: PlannedSubmission[];
}

export interface PlannedGroup {
  name: string;
  roleCodes: RoleCode[];
  /** Dev users to add, all members of the owning workspace. */
  memberUserIndexes: number[];
}

export interface PlannedWorkspace {
  index: number;
  name: string;
  org: string;
  useCase: string;
  disclaimerAccepted: boolean;
  audience: PlannedAudience;
  /** Role the target user holds, or null when they are not a member. */
  targetUserRole: WorkspaceMembershipRoleCode | null;
  /** Dev user who owns the workspace, or null when the target user does. */
  ownerUserIndex: number | null;
  members: Array<{ userIndex: number; role: WorkspaceMembershipRoleCode }>;
  /**
   * Group carrying the target user's form permissions, set where they are not the owner. Form
   * access comes only from group roles, so without this their workspace role grants nothing.
   */
  targetGroup: { name: string; roleCodes: RoleCode[] } | null;
  groups: PlannedGroup[];
  forms: PlannedForm[];
  anchor: PlannedAnchor | null;
}

export type PlannedAnchor = 'pagingForms' | 'pagingSubmissions' | 'pagingMembers';

export interface PlannedUser {
  index: number;
  displayLabel: string;
  subject: string;
  identityProviderCode: string;
  profile: NormalizedProfile;
}

export interface DevDataPlan {
  size: SizeName;
  users: PlannedUser[];
  workspaces: PlannedWorkspace[];
}

const ORGS = [
  'Ministry of Citizens Services',
  'Ministry of Environment and Parks',
  'Ministry of Forests',
  'Ministry of Health',
] as const;

const USE_CASES = [
  'Intake and triage',
  'Grant applications',
  'Field inspections',
  'Internal requests',
] as const;

const GROUP_ROLE_SETS: RoleCode[][] = [
  [Roles.form_designer],
  [Roles.submission_reviewer],
  [Roles.submission_reviewer, Roles.submission_approver],
];

const pad2 = (n: number): string => String(n).padStart(2, '0');

const pick = <T>(pool: readonly T[], index: number): T => pool[index % pool.length];

/** Anchors take the first three slots so their indices are stable. */
const ANCHORS: readonly PlannedAnchor[] = ['pagingForms', 'pagingSubmissions', 'pagingMembers'];

const anchorAt = (index: number): PlannedAnchor | null => ANCHORS[index] ?? null;

const ANCHOR_NAMES: Record<PlannedAnchor, string> = {
  pagingForms: `${DEV_PREFIX}Paging Forms`,
  pagingSubmissions: `${DEV_PREFIX}Paging Submissions`,
  pagingMembers: `${DEV_PREFIX}Paging Members`,
};

/** Owner first, then equal runs of admin/member/viewer, then workspaces they are not in. */
function targetRoleFor(sizing: Sizing, index: number): WorkspaceMembershipRoleCode | null {
  const { owner, secondary } = sizing.roles;
  if (index < owner) return WorkspaceMembershipRole.owner;
  if (index < owner + secondary) return WorkspaceMembershipRole.admin;
  if (index < owner + 2 * secondary) return WorkspaceMembershipRole.member;
  if (index < sizing.memberWorkspaces) return WorkspaceMembershipRole.viewer;
  return null;
}

function workspaceName(sizing: Sizing, index: number): string {
  const anchor = anchorAt(index);
  if (anchor) return ANCHOR_NAMES[anchor];
  if (index >= sizing.memberWorkspaces) {
    return `${DEV_PREFIX}Unrelated Workspace ${pad2(index - sizing.memberWorkspaces + 1)}`;
  }
  return `${DEV_PREFIX}Workspace ${pad2(index + 1)}`;
}

/** First index of each role band, so every role the target holds has a workspace with forms. */
function bandStarts(sizing: Sizing): Set<number> {
  const { owner, secondary } = sizing.roles;
  return new Set([0, owner, owner + secondary, owner + 2 * secondary]);
}

/**
 * Anchors and role-band starts accept; the last workspace never does, so the no-forms gate is
 * represented at every size. Between those, two in five decline.
 */
function disclaimerAcceptedFor(sizing: Sizing, index: number): boolean {
  if (anchorAt(index)) return true;
  if (index === sizing.workspaceCount - 1) return false;
  if (bandStarts(sizing).has(index)) return true;
  return index % 5 !== 3 && index % 5 !== 4;
}

/**
 * Derived, not fixed: an audience only means something on a workspace that holds published forms,
 * and fixed indices fall outside the smaller sizes. Index 1 is the submissions anchor, so anonymous
 * rows land in the paged list.
 */
const publicIndexes = (sizing: Sizing): Set<number> =>
  new Set([1, Math.floor(sizing.memberWorkspaces / 2)]);

const noAudienceIndex = (sizing: Sizing): number => sizing.memberWorkspaces - 1;

function audienceFor(sizing: Sizing, index: number): PlannedAudience {
  if (index === noAudienceIndex(sizing)) return 'none';
  return publicIndexes(sizing).has(index) ? 'public' : 'protected';
}

function formCountFor(sizing: Sizing, index: number, anchor: PlannedAnchor | null): number {
  if (!disclaimerAcceptedFor(sizing, index)) return 0;
  if (anchor === 'pagingForms') return sizing.max;
  if (anchor === 'pagingSubmissions') return 3;
  if (anchor === 'pagingMembers') return 1;
  // At least one: a workspace that accepted the disclaimer and holds nothing tests nothing.
  return 1 + (index % sizing.formSpread);
}

/** Two in three get published. Only a published version can take submissions. */
const publishedFor = (formIndex: number): boolean => formIndex % 3 !== 2;

/** Publishing needs a ready version, so only unpublished forms stay unprovisioned. */
const provisionedFor = (formIndex: number): boolean =>
  publishedFor(formIndex) || formIndex % 6 !== 5;

function submissionCountFor(args: {
  sizing: Sizing;
  workspaceIndex: number;
  formIndex: number;
  anchor: PlannedAnchor | null;
  published: boolean;
}): number {
  if (!args.published) return 0;
  if (args.anchor === 'pagingSubmissions' && args.formIndex === 0) return args.sizing.max;
  return (args.workspaceIndex + args.formIndex) % args.sizing.submissionSpread;
}

/** 1 in 5 stays 'opened', 2 in 5 end 'draft', 2 in 5 end 'submitted'. */
function submissionEventsFor(index: number): Array<'saved' | 'submitted'> {
  const slot = index % 5;
  if (slot === 0) return [];
  if (slot === 1 || slot === 2) return ['saved'];
  if (slot === 3) return ['submitted'];
  return ['saved', 'submitted'];
}

/** The target only submits where they are a member; elsewhere the workspace's own users do. */
function submitterFor(args: {
  index: number;
  audience: PlannedAudience;
  memberUserIndexes: number[];
  targetIsMember: boolean;
}): PlannedSubmitter {
  const { index, memberUserIndexes } = args;
  if (args.audience === 'public' && index % 4 === 3) return { kind: 'anonymous' };

  // Before the targetIsMember branch: with no members there is no dev user to pick.
  if (memberUserIndexes.length === 0) {
    if (!args.targetIsMember) {
      throw new Error('A workspace with no members and no target cannot hold a submission');
    }
    return { kind: 'target' };
  }

  const devUser = (): PlannedSubmitter => ({
    kind: 'devUser',
    userIndex: memberUserIndexes[index % memberUserIndexes.length],
  });
  if (!args.targetIsMember) return devUser();
  return index % 3 === 0 ? { kind: 'target' } : devUser();
}

function buildSubmissions(args: {
  sizing: Sizing;
  workspaceIndex: number;
  formIndex: number;
  anchor: PlannedAnchor | null;
  published: boolean;
  audience: PlannedAudience;
  memberUserIndexes: number[];
  targetIsMember: boolean;
}): PlannedSubmission[] {
  const count = submissionCountFor(args);
  return Array.from({ length: count }, (_unused, index) => ({
    index,
    events: submissionEventsFor(index),
    submitter: submitterFor({ ...args, index }),
  }));
}

function formName(workspaceIndex: number, formIndex: number, anchor: PlannedAnchor | null): string {
  if (anchor === 'pagingSubmissions' && formIndex === 0) {
    return `${DEV_PREFIX}Paging Submissions Form`;
  }
  return `${DEV_PREFIX}Form ${pad2(workspaceIndex + 1)}-${pad2(formIndex + 1)}`;
}

function fixtureCodeFor(formIndex: number, anchor: PlannedAnchor | null): string {
  if (anchor === 'pagingSubmissions' && formIndex === 0) return PAGING_FIXTURE_CODE;
  return fixtureAt(formIndex).code;
}

function buildForms(args: {
  sizing: Sizing;
  workspaceIndex: number;
  anchor: PlannedAnchor | null;
  audience: PlannedAudience;
  memberUserIndexes: number[];
  targetIsMember: boolean;
}): PlannedForm[] {
  const count = formCountFor(args.sizing, args.workspaceIndex, args.anchor);
  return Array.from({ length: count }, (_unused, formIndex) => {
    const published = publishedFor(formIndex);
    return {
      index: formIndex,
      name: formName(args.workspaceIndex, formIndex, args.anchor),
      description: `Generated ${fixtureCodeFor(formIndex, args.anchor)} form for development.`,
      fixtureCode: fixtureCodeFor(formIndex, args.anchor),
      provisioned: provisionedFor(formIndex),
      published,
      submissions: buildSubmissions({ ...args, formIndex, published }),
    };
  });
}

/**
 * Dev users per workspace: all of them in the members anchor, a spread elsewhere. Never zero, so
 * member lists and groups always have someone in them.
 */
function memberCountFor(sizing: Sizing, index: number, anchor: PlannedAnchor | null): number {
  if (anchor === 'pagingMembers') return sizing.max;
  // Several, so the anchor's rows are not all from one submitter.
  if (anchor === 'pagingSubmissions') return Math.min(5, sizing.max - 1);
  return 1 + (index % sizing.memberSpread);
}

function memberIndexesFor(
  sizing: Sizing,
  index: number,
  anchor: PlannedAnchor | null,
  ownerUserIndex: number | null,
): number[] {
  const all = Array.from({ length: sizing.max }, (_unused, i) => (i + index) % sizing.max);
  // The owner already has a membership row and the unique index forbids a second.
  return all.filter((i) => i !== ownerUserIndex).slice(0, memberCountFor(sizing, index, anchor));
}

const MEMBER_ROLES: readonly WorkspaceMembershipRoleCode[] = [
  WorkspaceMembershipRole.admin,
  WorkspaceMembershipRole.member,
  WorkspaceMembershipRole.viewer,
];

/** Two in three workspaces get custom groups, sized to the members available to fill them. */
function buildGroups(index: number, memberIndexes: number[]): PlannedGroup[] {
  if (index % 3 === 2 || memberIndexes.length === 0) return [];
  const count = memberIndexes.length >= 2 ? 2 : 1;
  return Array.from({ length: count }, (_unused, groupIndex) => ({
    name: `${DEV_PREFIX}Group ${pad2(index + 1)}-${pad2(groupIndex + 1)}`,
    roleCodes: pick(GROUP_ROLE_SETS, index + groupIndex),
    memberUserIndexes: memberIndexes.slice(0, groupIndex + 1),
  }));
}

/** Workspace role to the form roles it should imply. Owners are covered by the bootstrap group. */
const TARGET_ROLE_GROUPS: Record<string, RoleCode[]> = {
  [WorkspaceMembershipRole.admin]: [Roles.form_admin],
  [WorkspaceMembershipRole.member]: [Roles.form_designer, Roles.form_submitter],
  [WorkspaceMembershipRole.viewer]: [Roles.submission_approver],
};

function buildTargetGroup(
  index: number,
  role: WorkspaceMembershipRoleCode | null,
  ownerUserIndex: number | null,
): PlannedWorkspace['targetGroup'] {
  if (!role || ownerUserIndex == null) return null;
  const roleCodes = TARGET_ROLE_GROUPS[role];
  if (!roleCodes) return null;
  return { name: `${DEV_PREFIX}Workspace ${pad2(index + 1)} ${role} access`, roleCodes };
}

function buildWorkspace(sizing: Sizing, index: number): PlannedWorkspace {
  const anchor = anchorAt(index);
  const targetUserRole = targetRoleFor(sizing, index);
  const ownerUserIndex =
    targetUserRole === WorkspaceMembershipRole.owner ? null : index % sizing.max;
  const memberIndexes = memberIndexesFor(sizing, index, anchor, ownerUserIndex);
  const audience = audienceFor(sizing, index);

  return {
    index,
    name: workspaceName(sizing, index),
    org: pick(ORGS, index),
    useCase: pick(USE_CASES, index),
    disclaimerAccepted: disclaimerAcceptedFor(sizing, index),
    audience,
    targetUserRole,
    ownerUserIndex,
    members: memberIndexes.map((userIndex, slot) => ({
      userIndex,
      role: pick(MEMBER_ROLES, slot),
    })),
    targetGroup: buildTargetGroup(index, targetUserRole, ownerUserIndex),
    groups: buildGroups(index, memberIndexes),
    forms: buildForms({
      sizing,
      workspaceIndex: index,
      anchor,
      audience,
      memberUserIndexes: memberIndexes,
      targetIsMember: targetUserRole != null,
    }),
    anchor,
  };
}

/** Two thirds IDIR, one third BCeID Business. Both are active login providers. */
const providerFor = (index: number): string => (index % 3 === 2 ? 'bceidbusiness' : 'azureidir');

const FIRST_NAMES = ['Rae', 'Sam', 'Jo', 'Kit', 'Lou', 'Nix', 'Ari'] as const;
const LAST_NAMES = ['Okonjo', 'Delacroix', 'Whitecalf', 'Ferreira', 'Nakamura', 'Bello'] as const;

function buildUser(index: number): PlannedUser {
  const username = `devuser${pad2(index + 1)}`;
  const firstName = pick(FIRST_NAMES, index);
  const lastName = pick(LAST_NAMES, index);
  const identityProviderCode = providerFor(index);
  const displayLabel = `${DEV_PREFIX}${username}`;
  const usernameClaim =
    identityProviderCode === 'bceidbusiness' ? 'bceid_username' : 'idir_username';

  return {
    index,
    displayLabel,
    subject: `${DEV_SUBJECT_PREFIX}${username}`,
    identityProviderCode,
    profile: {
      displayName: `${firstName} ${lastName}`,
      email: `${username}@example.test`,
      preferredUsername: username,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      [usernameClaim]: displayLabel,
      displayLabel,
    },
  };
}

/** Same output every time for a given size. */
export function buildPlan(size: SizeName = DEFAULT_SIZE): DevDataPlan {
  const sizing = sizingFor(size);
  return {
    size,
    users: Array.from({ length: sizing.max }, (_unused, index) => buildUser(index)),
    workspaces: Array.from({ length: sizing.workspaceCount }, (_unused, index) =>
      buildWorkspace(sizing, index),
    ),
  };
}

/** Workflow state the submission ends in. */
export function plannedSubmissionState(submission: PlannedSubmission): string {
  const last = submission.events[submission.events.length - 1];
  if (last === 'submitted') return 'submitted';
  if (last === 'saved') return 'draft';
  return 'opened';
}
