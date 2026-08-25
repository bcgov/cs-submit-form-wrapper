/**
 * Removes everything the generator made, identified by the ids each run recorded.
 *
 * Order matters: read engine refs, purge Postgres in one transaction, then delete engine documents
 * best-effort. Deleting documents first would leave live rows pointing at nothing.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { db, type DbOrTx } from '../../core/db/client';
import {
  appUsers,
  documentGenerationAudits,
  enterpriseGroupBindings,
  enterpriseMembershipBindings,
  enterpriseSyncCursors,
  enterpriseSyncLogs,
  enterpriseWorkspaceBindings,
  featureScopes,
  files,
  formVersionRevisions,
  formVersions,
  forms,
  sobaAdmins,
  submissionRevisions,
  submissions,
  userIdentities,
  workspaceDisclaimerAcceptances,
  workspaceGroupMemberships,
  workspaceGroupRoles,
  workspaceGroups,
  workspaceMemberships,
  workspaces,
} from '../../core/db/schema';
import { createFormEngineAdapter } from '../../core/integrations/form-engine/FormEngineRegistry';
import { log } from '../../core/logging';
import { idsFromRuns, listOpenRuns, markRunsPurged } from './runs';

export interface PurgeResult {
  rowsDeleted: Record<string, number>;
  engineFormsDeleted: number;
  engineSubmissionsDeleted: number;
  /** Engine documents that could not be deleted. Orphaned, nothing references them. */
  engineFailures: number;
  /** Engine documents left alone because their plugin is missing or cannot delete. */
  engineSkipped: number;
}

interface EngineRef {
  engineCode: string;
  formRef: string;
  submissionRef?: string;
}

/** Collected before any delete runs. */
export interface PurgeTargets {
  workspaceIds: string[];
  formIds: string[];
  userIds: string[];
  submissionRefs: EngineRef[];
  schemaRefs: EngineRef[];
  /** Run rows to mark purged once the delete succeeds. */
  runIds: string[];
}

export async function collectTargets(): Promise<PurgeTargets> {
  const runs = await listOpenRuns();
  const { workspaceIds, userIds } = idsFromRuns(runs);
  const runIds = runs.map((r) => r.id);

  if (workspaceIds.length === 0) {
    return { workspaceIds, formIds: [], userIds, submissionRefs: [], schemaRefs: [], runIds };
  }

  const formRows = await db
    .select({ id: forms.id })
    .from(forms)
    .where(inArray(forms.workspaceId, workspaceIds));

  return {
    workspaceIds,
    formIds: formRows.map((r) => r.id),
    userIds,
    submissionRefs: await collectSubmissionRefs(workspaceIds),
    schemaRefs: await collectSchemaRefs(workspaceIds),
    runIds,
  };
}

async function collectSubmissionRefs(workspaceIds: string[]): Promise<EngineRef[]> {
  const current = await db
    .select({
      engineCode: forms.formEngineCode,
      formRef: formVersions.engineSchemaRef,
      submissionRef: submissions.engineSubmissionRef,
    })
    .from(submissions)
    .innerJoin(formVersions, eq(formVersions.id, submissions.formVersionId))
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(
      and(
        inArray(submissions.workspaceId, workspaceIds),
        isNotNull(submissions.engineSubmissionRef),
        isNotNull(formVersions.engineSchemaRef),
      ),
    );

  const historic = await db
    .select({
      engineCode: forms.formEngineCode,
      formRef: formVersions.engineSchemaRef,
      submissionRef: submissionRevisions.afterEngineSubmissionRef,
    })
    .from(submissionRevisions)
    .innerJoin(submissions, eq(submissions.id, submissionRevisions.submissionId))
    .innerJoin(formVersions, eq(formVersions.id, submissions.formVersionId))
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(
      and(
        inArray(submissionRevisions.workspaceId, workspaceIds),
        isNotNull(submissionRevisions.afterEngineSubmissionRef),
        isNotNull(formVersions.engineSchemaRef),
      ),
    );

  const seen = new Set<string>();
  const refs: EngineRef[] = [];
  for (const row of [...current, ...historic]) {
    const { formRef, submissionRef } = row;
    if (!formRef || !submissionRef || seen.has(submissionRef)) continue;
    seen.add(submissionRef);
    refs.push({ engineCode: row.engineCode, formRef, submissionRef });
  }
  return refs;
}

async function collectSchemaRefs(workspaceIds: string[]): Promise<EngineRef[]> {
  const rows = await db
    .select({ engineCode: forms.formEngineCode, formRef: formVersions.engineSchemaRef })
    .from(formVersions)
    .innerJoin(forms, eq(forms.id, formVersions.formId))
    .where(
      and(inArray(formVersions.workspaceId, workspaceIds), isNotNull(formVersions.engineSchemaRef)),
    );
  return rows
    .filter((r): r is typeof r & { formRef: string } => Boolean(r.formRef))
    .map((r) => ({ engineCode: r.engineCode, formRef: r.formRef }));
}

/** Delete rows, counting them by table for the report. */
async function purgePostgres(
  targets: PurgeTargets,
  stampedBy: string | null,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    const record = async (label: string, run: Promise<{ rowCount: number | null }>) => {
      counts[label] = (await run).rowCount ?? 0;
    };

    if (targets.workspaceIds.length > 0) {
      await purgeWorkspaceScoped(tx, targets, record);
    }
    await markRunsPurged(tx as unknown as typeof db, targets.runIds, stampedBy);

    if (targets.userIds.length > 0) {
      const { userIds } = targets;
      await purgeUserScoped(tx, userIds, record);
      await record('soba_admin', tx.delete(sobaAdmins).where(inArray(sobaAdmins.userId, userIds)));
      await record(
        'user_identity',
        tx.delete(userIdentities).where(inArray(userIdentities.userId, userIds)),
      );
      await record('app_user', tx.delete(appUsers).where(inArray(appUsers.id, userIds)));
    }
  });

  return counts;
}

type RecordFn = (label: string, run: Promise<{ rowCount: number | null }>) => Promise<void>;

/**
 * Memberships a dev user holds in a workspace that is not being deleted, plus invitations they
 * issued. Either would block the app_user delete and roll the whole purge back.
 */
async function purgeUserScoped(tx: DbOrTx, userIds: string[], record: RecordFn): Promise<void> {
  const stranded = await tx
    .select({ id: workspaceMemberships.id })
    .from(workspaceMemberships)
    .where(inArray(workspaceMemberships.userId, userIds));
  const membershipIds = stranded.map((r) => r.id);

  if (membershipIds.length > 0) {
    await record(
      'workspace_group_membership (by user)',
      tx
        .delete(workspaceGroupMemberships)
        .where(inArray(workspaceGroupMemberships.workspaceMembershipId, membershipIds)),
    );
    await record(
      'workspace_membership (by user)',
      tx.delete(workspaceMemberships).where(inArray(workspaceMemberships.id, membershipIds)),
    );
  }

  await tx
    .update(workspaceMemberships)
    .set({ invitedByUserId: null })
    .where(inArray(workspaceMemberships.invitedByUserId, userIds));
}

/**
 * Tables purgeWorkspaceScoped clears, by database name. A test compares this against every schema
 * table carrying a workspace_id, so a new one cannot be added without purge being updated. The test
 * checks this list, not the function body: adding a name here without a delete below defeats it.
 */
export const WORKSPACE_SCOPED_TABLES = [
  'document_generation_audit',
  'submission_revision',
  'submission',
  'file',
  'form_version_revision',
  'form_version',
  'form',
  'workspace_group_role',
  'workspace_group_membership',
  'workspace_group',
  'workspace_disclaimer_acceptance',
  'workspace_membership',
  'feature_scope',
  'enterprise_sync_log',
  'enterprise_sync_cursor',
  'enterprise_group_binding',
  'enterprise_membership_binding',
  'enterprise_workspace_binding',
  'workspace',
] as const;

/**
 * Tables handled by user id rather than workspace id, plus app_user itself. Together with
 * WORKSPACE_SCOPED_TABLES this accounts for every foreign key into app_user, which a test enforces.
 *
 * dev_data_run is listed but never deleted, only marked purged. Its owner_user_id would block the
 * app_user delete, which is why resolveTargetUser and ensureOwner both refuse a generated user as
 * the owner.
 */
export const APP_USER_SCOPED_TABLES = [
  'workspace_membership',
  'workspace_group_membership',
  'soba_admin',
  'user_identity',
  'app_user',
  'dev_data_run',
] as const;

/** Children before parents. Every table here is reachable from a workspace id. */
async function purgeWorkspaceScoped(
  tx: DbOrTx,
  targets: PurgeTargets,
  record: RecordFn,
): Promise<void> {
  const ids = targets.workspaceIds;

  // Read inside the transaction and before the form delete below: collectTargets ran outside it,
  // so a form created since then is deleted here but missing from that snapshot.
  const formRows = await tx
    .select({ id: forms.id })
    .from(forms)
    .where(inArray(forms.workspaceId, ids));
  const formIds = formRows.map((r) => r.id);

  // First: these reference workspace_group and workspace_membership, and every FK is NO ACTION.
  await purgeEnterpriseBindings(tx, ids, record);

  await record(
    'document_generation_audit',
    tx.delete(documentGenerationAudits).where(inArray(documentGenerationAudits.workspaceId, ids)),
  );
  await record(
    'submission_revision',
    tx.delete(submissionRevisions).where(inArray(submissionRevisions.workspaceId, ids)),
  );
  await record('submission', tx.delete(submissions).where(inArray(submissions.workspaceId, ids)));
  await record('file', tx.delete(files).where(inArray(files.workspaceId, ids)));
  await record(
    'form_version_revision',
    tx.delete(formVersionRevisions).where(inArray(formVersionRevisions.workspaceId, ids)),
  );
  await record(
    'form_version',
    tx.delete(formVersions).where(inArray(formVersions.workspaceId, ids)),
  );
  await record('form', tx.delete(forms).where(inArray(forms.workspaceId, ids)));
  await record(
    'workspace_group_role',
    tx.delete(workspaceGroupRoles).where(inArray(workspaceGroupRoles.workspaceId, ids)),
  );
  await record(
    'workspace_group_membership',
    tx.delete(workspaceGroupMemberships).where(inArray(workspaceGroupMemberships.workspaceId, ids)),
  );
  await record(
    'workspace_group',
    tx.delete(workspaceGroups).where(inArray(workspaceGroups.workspaceId, ids)),
  );
  await record(
    'workspace_disclaimer_acceptance',
    tx
      .delete(workspaceDisclaimerAcceptances)
      .where(inArray(workspaceDisclaimerAcceptances.workspaceId, ids)),
  );
  await record(
    'workspace_membership',
    tx.delete(workspaceMemberships).where(inArray(workspaceMemberships.workspaceId, ids)),
  );

  // feature_scope.scope_id is polymorphic with no FK, so clear both scope kinds explicitly.
  const scopeIds = [...ids, ...formIds];
  await record(
    'feature_scope',
    tx.delete(featureScopes).where(inArray(featureScopes.scopeId, scopeIds)),
  );

  await record('workspace', tx.delete(workspaces).where(inArray(workspaces.id, ids)));
}

/** Unused scaffolding today, but they carry workspace FKs. */
async function purgeEnterpriseBindings(tx: DbOrTx, ids: string[], record: RecordFn): Promise<void> {
  await record(
    'enterprise_sync_log',
    tx.delete(enterpriseSyncLogs).where(inArray(enterpriseSyncLogs.workspaceId, ids)),
  );
  await record(
    'enterprise_sync_cursor',
    tx.delete(enterpriseSyncCursors).where(inArray(enterpriseSyncCursors.workspaceId, ids)),
  );
  await record(
    'enterprise_group_binding',
    tx.delete(enterpriseGroupBindings).where(inArray(enterpriseGroupBindings.workspaceId, ids)),
  );
  await record(
    'enterprise_membership_binding',
    tx
      .delete(enterpriseMembershipBindings)
      .where(inArray(enterpriseMembershipBindings.workspaceId, ids)),
  );
  await record(
    'enterprise_workspace_binding',
    tx
      .delete(enterpriseWorkspaceBindings)
      .where(inArray(enterpriseWorkspaceBindings.workspaceId, ids)),
  );
}

/** Best-effort: failures are counted and logged so one missing document cannot stop the rest. */
async function purgeEngine(targets: PurgeTargets): Promise<Omit<PurgeResult, 'rowsDeleted'>> {
  const adapters = new Map<string, ReturnType<typeof createFormEngineAdapter> | null>();
  // Resolving throws when the plugin that wrote the data is no longer installed. Postgres is
  // already committed here, so it must not escape.
  const adapterFor = (code: string) => {
    if (!adapters.has(code)) {
      try {
        adapters.set(code, createFormEngineAdapter(code));
      } catch (err) {
        log.warn({ err, code }, 'Dev data purge cannot resolve a form engine plugin');
        adapters.set(code, null);
      }
    }
    return adapters.get(code) ?? null;
  };

  let engineSubmissionsDeleted = 0;
  let engineFormsDeleted = 0;
  let engineFailures = 0;
  let engineSkipped = 0;

  const attempt = async (run: () => Promise<void>, ref: string): Promise<boolean> => {
    try {
      await run();
      return true;
    } catch (err) {
      engineFailures += 1;
      log.warn({ err, ref }, 'Dev data purge could not delete an engine document');
      return false;
    }
  };

  // Called on the adapter, not detached: these are prototype methods that read this.pluginConfig.
  for (const ref of targets.submissionRefs) {
    const adapter = adapterFor(ref.engineCode);
    if (typeof adapter?.deleteSubmission !== 'function' || !ref.submissionRef) {
      engineSkipped += 1;
      continue;
    }
    const { formRef, submissionRef } = ref;
    if (await attempt(() => adapter.deleteSubmission!(formRef, submissionRef), submissionRef)) {
      engineSubmissionsDeleted += 1;
    }
  }

  for (const ref of targets.schemaRefs) {
    const adapter = adapterFor(ref.engineCode);
    if (typeof adapter?.deleteSchema !== 'function') {
      engineSkipped += 1;
      continue;
    }
    const { formRef } = ref;
    if (await attempt(() => adapter.deleteSchema!(formRef), formRef)) {
      engineFormsDeleted += 1;
    }
  }

  return { engineFormsDeleted, engineSubmissionsDeleted, engineFailures, engineSkipped };
}

/** Safe to run when nothing is there. */
export async function purge(options: { stampedBy?: string | null } = {}): Promise<PurgeResult> {
  const targets = await collectTargets();
  const rowsDeleted = await purgePostgres(targets, options.stampedBy ?? null);
  const engine = await purgeEngine(targets);
  return { rowsDeleted, ...engine };
}
