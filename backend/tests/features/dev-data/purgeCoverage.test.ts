import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../../../src/core/db/schema';
import {
  APP_USER_SCOPED_TABLES,
  WORKSPACE_SCOPED_TABLES,
} from '../../../src/features/dev-data/purge';

/** Schema tables carrying a column, by database name. */
function tablesWithColumn(column: string): string[] {
  const names: string[] = [];
  for (const value of Object.values(schema)) {
    let config;
    try {
      config = getTableConfig(value as Parameters<typeof getTableConfig>[0]);
    } catch {
      continue; // not a table export
    }
    if (config.columns.some((c) => c.name === column)) names.push(config.name);
  }
  return names;
}

/** Tables with a foreign key to app_user, by database name. */
function tablesReferencingAppUser(): string[] {
  const names: string[] = [];
  for (const value of Object.values(schema)) {
    let config;
    try {
      config = getTableConfig(value as Parameters<typeof getTableConfig>[0]);
    } catch {
      continue;
    }
    const refsUser = config.foreignKeys.some(
      (fk) => fk.reference().foreignTable === schema.appUsers,
    );
    if (refsUser) names.push(config.name);
  }
  return names;
}

const workspaceScopedTables = () => tablesWithColumn('workspace_id');

describe('purge covers every workspace-scoped table', () => {
  it('deletes from each table that carries a workspace_id', () => {
    const covered = new Set<string>(WORKSPACE_SCOPED_TABLES);
    const missing = workspaceScopedTables().filter((name) => !covered.has(name));

    // A new workspace-scoped table that purge does not clear aborts the whole purge on its
    // foreign key, so the fix is to add it to WORKSPACE_SCOPED_TABLES and to purgeWorkspaceScoped.
    expect(missing).toEqual([]);
  });

  it('clears every table with a foreign key to app_user, by workspace or by user', () => {
    // The other class of table that aborts the purge transaction on a foreign key. Note the
    // workspace-scoped half only clears rows inside a purged workspace: a generated user stamped
    // on a row in someone else's workspace would still block the app_user delete. The generator
    // never does that, which is what makes this list sufficient rather than merely necessary.
    const covered = new Set<string>([...WORKSPACE_SCOPED_TABLES, ...APP_USER_SCOPED_TABLES]);
    expect(tablesReferencingAppUser().filter((name) => !covered.has(name))).toEqual([]);
  });

  it('lists nothing beyond the workspace-scoped tables and the known exceptions', () => {
    // workspace is cleared by its own id; feature_scope by the polymorphic scope_id, which is why
    // neither carries a workspace_id column.
    const allowed = new Set([...workspaceScopedTables(), 'workspace', 'feature_scope']);
    expect(WORKSPACE_SCOPED_TABLES.filter((name) => !allowed.has(name))).toEqual([]);
  });
});
