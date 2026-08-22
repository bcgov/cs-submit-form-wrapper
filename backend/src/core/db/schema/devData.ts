import { jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditColumns, idColumn } from './audit';
import { appUsers, sobaSchema } from './core';

/** Ids a run created. The only thing purge reads. */
export interface DevDataRunIds {
  workspaceIds: string[];
  userIds: string[];
}

/**
 * One row per development data set.
 *
 * `ids` is written as the run goes and is what purge deletes by, so a run that dies half way still
 * says what it made. `manifest` is the full record, written at the end, for whoever consumes the
 * run afterwards. Neither carries foreign keys: they must not constrain delete ordering, and they
 * outlive the rows they name.
 */
export const devDataRuns = sobaSchema.table('dev_data_run', {
  id: idColumn(),
  size: text('size').notNull(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => appUsers.id),
  /** generating (started, may be partial) | active | purged. */
  status: text('status').notNull(),
  /** { workspaceIds, userIds }, appended to during the run. All purge needs. */
  ids: jsonb('ids').$type<DevDataRunIds>().notNull().default({ workspaceIds: [], userIds: [] }),
  manifest: jsonb('manifest'),
  purgedAt: timestamp('purged_at', { withTimezone: true }),
  ...auditColumns(),
});
