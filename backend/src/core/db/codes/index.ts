/**
 * Single source of truth for all seeded code values. Seed and application code
 * import from here; no string literals for codes in logic. Compile-time safety.
 */

export const Roles = {
  // Form roles. form_admin holds the `*` wildcard permission.
  form_admin: 'form_admin',
  form_designer: 'form_designer',
  form_submitter: 'form_submitter',
  submission_reviewer: 'submission_reviewer',
  submission_approver: 'submission_approver',
} as const;
export type RoleCode = (typeof Roles)[keyof typeof Roles];

/** Form permissions. `all` is the `*` wildcard, held only by form_admin. */
export const Permissions = {
  all: '*',
  form_read: 'form_read',
  form_update: 'form_update',
  form_delete: 'form_delete',
  design_create: 'design_create',
  design_read: 'design_read',
  design_update: 'design_update',
  design_delete: 'design_delete',
  submission_create: 'submission_create',
  submission_read: 'submission_read',
  submission_update: 'submission_update',
  submission_delete: 'submission_delete',
  submission_review: 'submission_review',
  team_read: 'team_read',
  team_update: 'team_update',
} as const;
export type PermissionCode = (typeof Permissions)[keyof typeof Permissions];

export const RoleStatus = {
  active: 'active',
  deprecated: 'deprecated',
} as const;
export type RoleStatusCode = (typeof RoleStatus)[keyof typeof RoleStatus];

export const WorkspaceMembershipRole = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
  viewer: 'viewer',
} as const;
export type WorkspaceMembershipRoleCode =
  (typeof WorkspaceMembershipRole)[keyof typeof WorkspaceMembershipRole];

export const WorkspaceMembershipStatus = {
  active: 'active',
  inactive: 'inactive',
  pending: 'pending',
} as const;
export type WorkspaceMembershipStatusCode =
  (typeof WorkspaceMembershipStatus)[keyof typeof WorkspaceMembershipStatus];

/** Status of a workspace (workspace.status). */
export const WorkspaceStatus = {
  active: 'active',
  inactive: 'inactive',
} as const;
export type WorkspaceStatusCode = (typeof WorkspaceStatus)[keyof typeof WorkspaceStatus];

/** Kind of a workspace (workspace.kind); names are unique per kind. */
export const WorkspaceKind = {
  team: 'team',
} as const;
export type WorkspaceKindCode = (typeof WorkspaceKind)[keyof typeof WorkspaceKind];

export const FormStatus = {
  active: 'active',
  archived: 'archived',
  deleted: 'deleted',
} as const;
export type FormStatusCode = (typeof FormStatus)[keyof typeof FormStatus];

export const FormVersionState = {
  draft: 'draft',
  published: 'published',
  archived: 'archived',
  deleted: 'deleted',
} as const;
export type FormVersionStateCode = (typeof FormVersionState)[keyof typeof FormVersionState];

/** Submission lifecycle state (submission.workflow_state). Backend-owned; clients never set it. */
export const SubmissionWorkflowState = {
  opened: 'opened',
  draft: 'draft',
  submitted: 'submitted',
  deleted: 'deleted',
} as const;
export type SubmissionWorkflowStateCode =
  (typeof SubmissionWorkflowState)[keyof typeof SubmissionWorkflowState];

/** Submission lifecycle event (submission_revision.event_type). Mirrors the state flow. */
export const SubmissionEventType = {
  opened: 'opened',
  saved: 'saved',
  submitted: 'submitted',
} as const;
export type SubmissionEventTypeCode =
  (typeof SubmissionEventType)[keyof typeof SubmissionEventType];

export const FeatureStatus = {
  enabled: 'enabled',
  disabled: 'disabled',
  experimental: 'experimental',
  deprecated: 'deprecated',
} as const;
export type FeatureStatusCode = (typeof FeatureStatus)[keyof typeof FeatureStatus];

/**
 * Feature codes backed by the soba.feature table. Most gate a mounted API surface via
 * requireFeature and mirror the frontend FEATURE_CODES; antivirus is backend-only and gates
 * scan-on-upload behaviour inside the files surface rather than a surface of its own.
 */
export const Features = {
  design_mode: 'design-mode',
  submit_mode: 'submit-mode',
  files: 'files',
  antivirus: 'antivirus',
  /** Umbrella: gates the document-generation surface within submit. */
  document_generation: 'document-generation',
  /** Per-backend: which document-generation engine is available (v3 is scoped). */
  document_generation_v2: 'document-generation-v2',
  document_generation_v3: 'document-generation-v3',
  /** Backend-only: gates generating and purging development data. Off in production. */
  dev_data: 'dev-data',
} as const;
export type FeatureCode = (typeof Features)[keyof typeof Features];

/**
 * How a feature is gated (soba.feature.availability):
 *  - `fixed`  — available wherever the feature is platform-enabled; not gated to a workspace/form.
 *  - `scoped` — available only where an active feature_scope grant exists (a workspace or form).
 * A scoped feature that graduates to everyone is switched to `fixed`.
 */
export const FeatureAvailability = {
  fixed: 'fixed',
  scoped: 'scoped',
} as const;
export type FeatureAvailabilityCode =
  (typeof FeatureAvailability)[keyof typeof FeatureAvailability];

/** Target a feature_scope grant addresses (feature_scope.scope_type). */
export const FeatureScopeType = {
  workspace: 'workspace',
  form: 'form',
} as const;
export type FeatureScopeTypeCode = (typeof FeatureScopeType)[keyof typeof FeatureScopeType];

/** Lifecycle of a generated development data set (dev_data_run.status). */
export const DevDataRunStatus = {
  generating: 'generating',
  active: 'active',
  purged: 'purged',
} as const;
export type DevDataRunStatusCode = (typeof DevDataRunStatus)[keyof typeof DevDataRunStatus];

/** Status of a feature_scope grant (feature_scope.status). */
export const FeatureScopeStatus = {
  active: 'active',
  inactive: 'inactive',
} as const;
export type FeatureScopeStatusCode = (typeof FeatureScopeStatus)[keyof typeof FeatureScopeStatus];

/** Which render operation an audit row records (document_generation_audit.mode). */
export const DocumentGenerationMode = {
  preview: 'preview',
  print: 'print',
} as const;
export type DocumentGenerationModeCode =
  (typeof DocumentGenerationMode)[keyof typeof DocumentGenerationMode];

/** Outcome of a document-generation backend call (document_generation_audit.outcome). */
export const DocumentGenerationOutcome = {
  success: 'success',
  error: 'error',
} as const;
export type DocumentGenerationOutcomeCode =
  (typeof DocumentGenerationOutcome)[keyof typeof DocumentGenerationOutcome];

/** Display name for the group that grants form admin on all forms in a workspace. */
export const FORM_ADMINS_GROUP_NAME = 'Form administrators';

/** Display name for the group that grants form submit access in a workspace. */
export const FORM_SUBMITTERS_GROUP_NAME = 'Form submitters';

/** Logical IDP groups (see idp_group / idp_group_member). */
export const IdpGroups = {
  bcgov: 'bcgov',
  bceid: 'bceid',
} as const;
export type IdpGroupCode = (typeof IdpGroups)[keyof typeof IdpGroups];

/** Seeded login identity providers (see identity_provider). `public` is the pseudo-provider below. */
export const IdentityProviders = {
  idir: 'idir',
  azureidir: 'azureidir',
  bceidbusiness: 'bceidbusiness',
} as const;
export type IdentityProviderCode = (typeof IdentityProviders)[keyof typeof IdentityProviders];

/** Pseudo identity provider that grants public (unauthenticated) submit access. */
export const PUBLIC_PROVIDER_CODE = 'public';

/** Identity subject of the seeded public user (provider=public). */
export const PUBLIC_SUBJECT = 'soba-public';

/** Display label for the seeded public user and the anonymous-submission attribution fallback. */
export const PUBLIC_SUBMITTER_LABEL = 'Public Submitter';

/** Marks the two bootstrap groups carrying team-guard protections (see workspace_group.system_code). */
export const SystemGroup = {
  form_admins: 'form_admins',
  form_submitters: 'form_submitters',
} as const;
export type SystemGroupCode = (typeof SystemGroup)[keyof typeof SystemGroup];

/** Kind of a workspace group member (see workspace_group_membership.member_kind). */
export const GroupMemberKind = {
  user: 'user',
  idp: 'idp',
  idp_group: 'idp_group',
} as const;
export type GroupMemberKindCode = (typeof GroupMemberKind)[keyof typeof GroupMemberKind];

/** Status of a workspace group (workspace_group.status). */
export const WorkspaceGroupStatus = {
  active: 'active',
  inactive: 'inactive',
} as const;
export type WorkspaceGroupStatusCode =
  (typeof WorkspaceGroupStatus)[keyof typeof WorkspaceGroupStatus];

/** Status of a workspace group membership (workspace_group_membership.status). */
export const WorkspaceGroupMembershipStatus = {
  active: 'active',
  inactive: 'inactive',
} as const;
export type WorkspaceGroupMembershipStatusCode =
  (typeof WorkspaceGroupMembershipStatus)[keyof typeof WorkspaceGroupMembershipStatus];

/** Status of a role assigned to a workspace group (workspace_group_role.status). */
export const WorkspaceGroupRoleStatus = {
  active: 'active',
  inactive: 'inactive',
} as const;
export type WorkspaceGroupRoleStatusCode =
  (typeof WorkspaceGroupRoleStatus)[keyof typeof WorkspaceGroupRoleStatus];

/** Membership source when created automatically as user's home workspace. */
export const WorkspaceMembershipSource = {
  auto_home: 'auto_home',
  user_created: 'user_created',
} as const;
export type WorkspaceMembershipSourceCode =
  (typeof WorkspaceMembershipSource)[keyof typeof WorkspaceMembershipSource];
