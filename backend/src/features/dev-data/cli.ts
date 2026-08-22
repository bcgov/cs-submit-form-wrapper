// Must be first: initializes .env + .env.local for this process.
import { env } from '../../core/config/env';
env.loadEnv();

import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { pool } from '../../core/db/client';
import { AppError } from '../../core/errors';
import { generate, type DevDataManifest } from './generate';
import { collectTargets, purge, type PurgeResult } from './purge';
import { acquireDevDataLock, assertDevDataEnabled, describeTarget } from './guard';
import { DEFAULT_SIZE, SIZE_NAMES, SIZES, type SizeName } from './plan';
import { requireBaseSeed } from './preconditions';
import { resolveTargetUser, type ResolvedUser } from './resolveUser';
import {
  buildOwnerFile,
  DEFAULT_OWNER_FILE,
  ensureOwner,
  ownerFileMatches,
  readOwnerFile,
  writeOwnerFile,
} from './ownerFile';

const USAGE = `Development data generator.

Usage:
  pnpm db:dev-data --generate-owner-file --username <idir-username>
  pnpm db:dev-data --seed
  pnpm db:dev-data --seed --username <idir-username>
  pnpm db:dev-data --purge
  pnpm db:dev-data --reset

Actions:
  --seed                  Build the data set. Fails if one is already present.
  --purge                 Remove every generated row and its form engine documents.
  --reset                 Purge, then seed.
  --generate-owner-file   Record the named user's app_user + user_identity for reuse.

Options:
  --username <name>       Target user, matched on app_user.display_label (the IdP username).
  --owner-file <path>     Owner file location (default ${DEFAULT_OWNER_FILE}).
  --size <name>           ${SIZE_NAMES.join(' | ')} (default ${DEFAULT_SIZE}). Scales workspaces,
                          forms, submissions, and users: ${SIZE_NAMES.map((n) => `${n}=${SIZES[n]}`).join(', ')}.
  --skip-anonymous        Attribute the public user's submissions to the target user instead.
  --dry-run               With --purge, report what would be removed and stop.
  --out <path>            Write the manifest JSON to a file.
  --help                  Show this message.

Choosing the owner:
  With an owner file present, --seed takes no arguments and creates the recorded user if this
  database does not have them. Without one, name a user who has already signed in.

Run "pnpm db:init" first. The generator builds on the migrated, seeded database.
Needs the dev-data feature status to be enabled: set FEATURE_DEV_DATA_STATUS=enabled,
then run pnpm db:seed.`;

const OWNER_FILE_ACTION = 'generate-owner-file';

const ACTIONS = ['seed', 'purge', 'reset', OWNER_FILE_ACTION] as const;

type Action = (typeof ACTIONS)[number];

interface CliOptions {
  action: Action;
  /** Explicit --username, when given. */
  username?: string;
  size: SizeName;
  ownerFilePath: string;
  includeAnonymous: boolean;
  dryRun: boolean;
  out?: string;
}

class UsageError extends Error {}

function resolveAction(flags: Partial<Record<Action, boolean>>): Action {
  const chosen = ACTIONS.filter((name) => flags[name]);
  if (chosen.length !== 1) {
    throw new UsageError(`Choose exactly one of ${ACTIONS.map((a) => `--${a}`).join(', ')}`);
  }
  return chosen[0];
}

function readSize(value?: string): SizeName {
  if (!value) return DEFAULT_SIZE;
  if (!(SIZE_NAMES as string[]).includes(value)) {
    throw new UsageError(`--size must be one of ${SIZE_NAMES.join(', ')}`);
  }
  return value as SizeName;
}

/** parseArgs throws its own error type for a bad flag. Surface it like the rest. */
function parseArgv(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      options: {
        seed: { type: 'boolean', default: false },
        purge: { type: 'boolean', default: false },
        reset: { type: 'boolean', default: false },
        [OWNER_FILE_ACTION]: { type: 'boolean', default: false },
        username: { type: 'string' },
        'owner-file': { type: 'string' },
        size: { type: 'string' },
        'skip-anonymous': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        out: { type: 'string' },
        help: { type: 'boolean', default: false },
      },
    });
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : 'Invalid arguments');
  }
}

function parse(argv: string[]): CliOptions {
  const { values } = parseArgv(argv);

  if (values.help) throw new UsageError('');

  const action = resolveAction(values);
  const username = values.username;

  // The only action with no fallback.
  if (action === OWNER_FILE_ACTION && !username) {
    throw new UsageError('--username is required to write the owner file');
  }
  if (values['dry-run'] && action !== 'purge') {
    throw new UsageError('--dry-run only applies to --purge');
  }

  return {
    action,
    username,
    size: readSize(values.size),
    ownerFilePath: values['owner-file'] ?? DEFAULT_OWNER_FILE,
    includeAnonymous: !values['skip-anonymous'],
    dryRun: values['dry-run'] ?? false,
    out: values.out,
  };
}

function reportPurge(result: PurgeResult): void {
  const rows = Object.entries(result.rowsDeleted).filter(([, count]) => count > 0);
  console.log('Purged:');
  for (const [table, count] of rows) {
    console.log(`  ${table.padEnd(32)} ${count}`);
  }
  console.log(
    `  form engine${''.padEnd(21)} ${result.engineFormsDeleted} forms, ` +
      `${result.engineSubmissionsDeleted} submissions`,
  );
  if (result.engineFailures > 0) {
    console.log(`  ${result.engineFailures} engine document(s) could not be deleted (orphaned)`);
  }
  if (result.engineSkipped > 0) {
    console.log(`  ${result.engineSkipped} engine document(s) skipped, no plugin to delete them`);
  }
}

async function reportDryRun(): Promise<void> {
  const targets = await collectTargets();
  console.log(`Would remove from ${describeTarget()}:`);
  console.log(`  workspaces${''.padEnd(22)} ${targets.workspaceIds.length}`);
  console.log(`  forms${''.padEnd(27)} ${targets.formIds.length}`);
  console.log(`  users${''.padEnd(27)} ${targets.userIds.length}`);
  console.log(`  engine form documents${''.padEnd(11)} ${targets.schemaRefs.length}`);
  console.log(`  engine submission documents${''.padEnd(5)} ${targets.submissionRefs.length}`);
}

function reportManifest(manifest: DevDataManifest): void {
  console.log(
    `Generated (${manifest.size}) for ${manifest.owner.displayLabel ?? manifest.owner.id}:`,
  );
  for (const [key, count] of Object.entries(manifest.counts)) {
    console.log(`  ${key.padEnd(32)} ${count}`);
  }
  console.log('Anchors (sized to spill onto a second page at the matching page size):');
  console.log(`  paging forms       ${manifest.anchors.pagingForms ?? '-'}`);
  console.log(`  paging members     ${manifest.anchors.pagingMembers ?? '-'}`);
  const submissions = manifest.anchors.pagingSubmissions;
  console.log(
    `  paging submissions ${submissions ? `${submissions.workspaceId} form ${submissions.formId}` : '-'}`,
  );
}

/**
 * Uses the owner file when it is the only reference, or when --username names the same person,
 * creating that user if absent. Otherwise looks the named user up.
 */
async function resolveOwner(options: CliOptions): Promise<ResolvedUser> {
  const owner = await readOwnerFile(options.ownerFilePath);
  const { username } = options;

  if (owner && (!username || ownerFileMatches(owner, username))) {
    const resolved = await ensureOwner(owner);
    console.log(`Owner ${resolved.displayLabel ?? resolved.id} (from ${options.ownerFilePath})`);
    return resolved;
  }
  if (!username) {
    throw new UsageError(
      `No ${options.ownerFilePath}; pass --username, or write one with --generate-owner-file`,
    );
  }
  return resolveTargetUser({ username });
}

async function runGenerateOwnerFile(options: CliOptions): Promise<void> {
  await assertDevDataEnabled();
  await requireBaseSeed();
  const owner = await buildOwnerFile({ username: options.username as string });
  await writeOwnerFile(options.ownerFilePath, owner);
  console.log(
    `Wrote ${options.ownerFilePath} for ${owner.displayLabel ?? '(no label)'} ` +
      `(${owner.identity.identityProviderCode}). Gitignored, keep it that way.`,
  );
}

async function runSeed(options: CliOptions, owner: ResolvedUser): Promise<void> {
  const manifest = await generate({
    user: { userId: owner.id },
    size: options.size,
    includeAnonymousSubmissions: options.includeAnonymous,
  });
  reportManifest(manifest);

  if (options.out) {
    await writeFile(options.out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Manifest written to ${options.out}`);
  }
}

async function run(options: CliOptions): Promise<void> {
  if (options.action === OWNER_FILE_ACTION) {
    return runGenerateOwnerFile(options);
  }

  await assertDevDataEnabled();
  if (options.dryRun) return reportDryRun();

  await acquireDevDataLock();

  // Everything that can refuse the run happens before anything is deleted, so --reset cannot
  // destroy a data set and then fail on a missing owner or an unseeded database.
  const owner = options.action === 'purge' ? null : await prepareSeed(options);

  console.log(`Target ${describeTarget()}`);
  if (options.action === 'purge' || options.action === 'reset') {
    const result = await purge({ stampedBy: owner?.displayLabel ?? null });
    reportPurge(result);
    // The run is closed either way, so leftovers can only be cleaned by hand. Say so with the
    // exit code, not just a line of output.
    if (result.engineFailures + result.engineSkipped > 0) {
      throw new AppError(
        `Postgres is clean but ${result.engineFailures + result.engineSkipped} form engine document(s) were left behind`,
        1,
      );
    }
  }
  if (options.action === 'purge' || !owner) return;

  return runSeed(options, owner);
}

/** Resolve everything the seed needs up front, before the purge half of --reset runs. */
async function prepareSeed(options: CliOptions): Promise<ResolvedUser> {
  await requireBaseSeed();
  return resolveOwner(options);
}

const main = async (): Promise<void> => {
  const options = parse(process.argv.slice(2));
  const started = Date.now();
  await run(options);
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s`);
};

/** Usage problems print the usage text; an AppError prints its message; anything else its stack. */
function report(error: unknown): number {
  if (error instanceof UsageError) {
    if (error.message) console.error(`${error.message}\n`);
    console.log(USAGE);
    return error.message ? 2 : 0;
  }
  if (error instanceof AppError) {
    console.error(error.message);
    return 1;
  }
  console.error(error);
  return 1;
}

main()
  .then(() => 0)
  .catch(report)
  .then(async (code) => {
    // exitCode rather than exit(): lets stdout flush when the output is piped. A failure closing
    // the pool must not overwrite the code the command earned.
    process.exitCode = code;
    try {
      await pool.end();
    } catch (error) {
      console.error(error);
    }
  });
