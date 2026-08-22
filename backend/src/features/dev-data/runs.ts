/**
 * A row per data set, recording the ids it creates as it creates them. These ids are the only thing
 * purge identifies its work by, so a generated row stays reachable however it is renamed.
 */
import { eq, inArray, ne, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { db, type DbOrTx } from '../../core/db/client';
import { DevDataRunStatus } from '../../core/db/codes';
import { devDataRuns, type DevDataRunIds } from '../../core/db/schema';

export type { DevDataRunIds };

const EMPTY: DevDataRunIds = { workspaceIds: [], userIds: [] };

export const startRun = async (args: {
  size: string;
  ownerUserId: string;
  stampedBy: string | null;
}): Promise<string> => {
  const id = uuidv7();
  await db.insert(devDataRuns).values({
    id,
    size: args.size,
    ownerUserId: args.ownerUserId,
    status: DevDataRunStatus.generating,
    ids: EMPTY,
    createdBy: args.stampedBy,
    updatedBy: args.stampedBy,
  });
  return id;
};

/** Appends ids in the database, so a crash cannot lose what an earlier append recorded. */
export const recordIds = async (
  runId: string,
  add: Partial<DevDataRunIds>,
  tx?: DbOrTx,
): Promise<void> => {
  const workspaceIds = add.workspaceIds ?? [];
  const userIds = add.userIds ?? [];
  if (workspaceIds.length === 0 && userIds.length === 0) return;

  await (tx ?? db)
    .update(devDataRuns)
    .set({
      ids: sql`jsonb_set(
        jsonb_set(${devDataRuns.ids}, '{workspaceIds}',
          (${devDataRuns.ids} -> 'workspaceIds') || ${JSON.stringify(workspaceIds)}::jsonb),
        '{userIds}',
        (${devDataRuns.ids} -> 'userIds') || ${JSON.stringify(userIds)}::jsonb)`,
      updatedAt: new Date(),
    })
    .where(eq(devDataRuns.id, runId));
};

export const finishRun = async (
  id: string,
  manifest: unknown,
  stampedBy: string | null,
): Promise<void> => {
  await db
    .update(devDataRuns)
    .set({
      status: DevDataRunStatus.active,
      manifest,
      updatedAt: new Date(),
      updatedBy: stampedBy,
    })
    .where(eq(devDataRuns.id, id));
};

export interface OpenRun {
  id: string;
  ids: DevDataRunIds;
}

/** Runs that have not been purged, including ones that never finished. */
export const listOpenRuns = async (): Promise<OpenRun[]> => {
  const rows = await db
    .select({ id: devDataRuns.id, ids: devDataRuns.ids })
    .from(devDataRuns)
    .where(ne(devDataRuns.status, DevDataRunStatus.purged));
  return rows.map((row) => ({
    id: row.id,
    ids: {
      workspaceIds: row.ids?.workspaceIds ?? [],
      userIds: row.ids?.userIds ?? [],
    },
  }));
};

/** Everything the open runs created, merged. */
export function idsFromRuns(runs: OpenRun[]): DevDataRunIds {
  const workspaceIds = new Set<string>();
  const userIds = new Set<string>();
  for (const run of runs) {
    for (const id of run.ids.workspaceIds) workspaceIds.add(id);
    for (const id of run.ids.userIds) userIds.add(id);
  }
  return { workspaceIds: [...workspaceIds], userIds: [...userIds] };
}

export const markRunsPurged = async (
  executor: typeof db,
  ids: string[],
  stampedBy: string | null,
): Promise<void> => {
  if (ids.length === 0) return;
  await executor
    .update(devDataRuns)
    .set({
      status: DevDataRunStatus.purged,
      purgedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: stampedBy,
    })
    .where(inArray(devDataRuns.id, ids));
};

/** True when a set is already present, so a second generate cannot collide with it. */
export const hasOpenRun = async (): Promise<boolean> => {
  const rows = await db
    .select({ id: devDataRuns.id })
    .from(devDataRuns)
    .where(ne(devDataRuns.status, DevDataRunStatus.purged))
    .limit(1);
  return rows.length > 0;
};
