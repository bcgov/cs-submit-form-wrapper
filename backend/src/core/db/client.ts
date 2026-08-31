import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';
import { drizzleQueryLogger } from './queryLogger';

// Env is loaded by process entrypoints before db modules are imported.
const databaseUrl = env.getDatabaseUrl();
const dbPoolMax = env.getNumberEnv('DB_POOL_MAX') ?? 10;
// Pipeline performance fix: Revert if needed.
const dbConnectionTimeoutMs = env.getDbConnectionTimeoutMs();
const dbStatementTimeoutMs = env.getDbStatementTimeoutMs();
// node-pg's query_timeout is client-side: it errors the query and returns the connection to the
// pool without cancelling the statement, so a connection can go back mid-statement. Keep it behind
// the server timeout, which cancels cleanly, however the two are configured.
const CLIENT_TIMEOUT_GRACE_MS = 5000;
const dbQueryTimeoutMs = Math.max(
  env.getDbQueryTimeoutMs(),
  dbStatementTimeoutMs + CLIENT_TIMEOUT_GRACE_MS,
);
const dbLockTimeoutMs = env.getDbLockTimeoutMs();

const pool = new Pool({
  connectionString: databaseUrl,
  max: dbPoolMax,
  connectionTimeoutMillis: dbConnectionTimeoutMs,
  query_timeout: dbQueryTimeoutMs,
  statement_timeout: dbStatementTimeoutMs,
  lock_timeout: dbLockTimeoutMs,
});
// Pipeline performance fix: Revert if needed.

export const db = drizzle(pool, { schema, logger: drizzleQueryLogger });
export type Db = typeof db;
/** Type of the argument passed to db.transaction callback; use for optional tx in repos. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Db or Tx for repo functions that accept an optional transaction. */
export type DbOrTx = Db | Tx;
export { pool };
