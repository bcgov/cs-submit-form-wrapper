import { db, type Tx } from './client';

/**
 * Runs a list's page query and its count against one snapshot, on one connection. Read committed
 * would give each statement its own snapshot, so a concurrent write between them yields a total
 * that does not describe the rows shipped with it.
 */
export const readListPage = <T>(run: (tx: Tx) => Promise<T>): Promise<T> =>
  db.transaction(run, { isolationLevel: 'repeatable read', accessMode: 'read only' });
