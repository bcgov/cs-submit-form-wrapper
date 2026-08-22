# Development data

Builds a disposable data set for local development and integration testing: workspaces, forms,
submissions, users, groups, and roles, in Postgres and in the form engine.

Every run records the ids it creates in `soba.dev_data_run` as it creates them, and purge deletes
by those ids. Generated rows also carry a `[dev] ` name prefix and generated identities a
`dev-data:` subject, but those are for reading the UI: nothing keys off them, so renaming a
generated row is safe.

Deleting a run row by hand puts what it made out of purge's reach.

## Before you start

Bring the sidecars up and initialise the database:

```bash
pnpm dev:services:up && pnpm db:init
```

Everything except `--purge` checks this and stops with one instruction if it has not been done.

### Turning it on

Everything here is gated on the `dev-data` feature, which the migration inserts as **disabled**.
Each environment decides with `FEATURE_DEV_DATA_STATUS`, applied to `soba.feature` by `db:seed`:

| Value | Effect |
| ----- | ------ |
| unset or empty | leave the feature as the migration set it |
| any `feature_status` code | set the feature to that status |

Statuses are `enabled`, `disabled`, `experimental`, and `deprecated`; a value outside the
`feature_status` table stops the seed rather than leaving the environment quietly wrong. The same
`FEATURE_<CODE>_STATUS` pattern works for every backend feature, not just this one.

**Only `db:seed` reads the variable.** `db:dev-data` checks the stored status, so:

- changing the variable does nothing until you run `pnpm db:seed` again
- once the row is set it stays set, whether or not the variable is still there
- a fresh `pnpm db:init` puts the row back to the migration's `disabled`, so the variable has to be
  in your environment at that point, not at the point you run the generator

`backend/.env.example` sets `enabled` for local. Deployments set it per environment through
`backend.features` in the Helm values, read by the migration job that runs the seed. Production
leaves it off.

## Commands

```bash
pnpm db:dev-data --seed --username <idir-username>   # build the set
pnpm db:dev-data --purge                             # remove it
pnpm db:dev-data --reset --username <idir-username>  # purge, then build
pnpm db:dev-data --help
```

`--out <path>` writes the manifest (ids of everything created) to a file, for an integration test to
read. `--skip-anonymous` attributes the public user's submissions to the target user instead, so the
row counts the paging anchors depend on stay the same. `--purge --dry-run` reports what would be
removed without touching anything. Seed, purge and reset all echo the target database first.

### Size

`--size small | medium | large` (default `large`) scales workspaces, forms, submissions, and users
together. Each size is one more than a page size the tables offer, so the largest lists spill onto a
second page at that setting.

| Size     | Anchored rows | Workspaces | Forms | Submissions | Time |
| -------- | ------------- | ---------- | ----- | ----------- | ---- |
| `small`  | 6             | 7          | 15    | 16          | 3s   |
| `medium` | 11            | 12         | 29    | 44          | 6s   |
| `large`  | 21            | 24         | 74    | 202         | 16s  |

The role split, forms per workspace, submissions per form, and members per workspace are all derived
from that number, so every state listed below exists at every size.

## Choosing the owner

The data is built around one real user, named with `--username` and matched against
`app_user.display_label`, which holds the IdP username.

That user is never invented. Without the owner file below they must already exist, so a fresh
database needs a sign-in first:

```bash
pnpm db:dev-data --generate-owner-file --username <idir-username>   # once, after signing in
pnpm db:dev-data --seed                                             # from then on, anywhere
```

`--generate-owner-file` copies your real `app_user` and `user_identity` into `.devdata-owner`, which
is gitignored. With that file present, `--seed` takes no arguments: it creates the recorded user on
a database that has never seen them, then builds the set around them.

The recorded subject must stay real. Sign-in matches on `(provider, subject)`, so a real subject is
adopted on first login; an invented one leaves you signed in as a second, empty user with the data
on a ghost.

Precedence: no `--username` uses the file; a `--username` that matches the file uses the file;
otherwise the named user is looked up and must already exist.

The file does not carry `soba_admin`. A recreated user is not a platform admin until their next
sign-in restores it from their IdP claims.

## What gets built

Anchor workspaces are created last so they hold the newest ids and lead the default `id:desc`
list. The frontend asks for one page and does not follow the cursor, so at `large` the anchors
would otherwise be the rows that fall off it.

Three anchor workspaces hold the anchored row count for the chosen size:

| Anchor                     | Holds                                             |
| -------------------------- | ------------------------------------------------- |
| `[dev] Paging Forms`       | the anchored count in forms                       |
| `[dev] Paging Members`     | the anchored count in dev members, plus the owner |
| `[dev] Paging Submissions` | `[dev] Paging Submissions Form`, anchored count   |

Everything else is smaller than the anchors and spread so each distinct state exists somewhere:

- the owner holds all four workspace roles (at `large`: 12 owner, 3 admin, 3 member, 3 viewer), and
  some workspaces exist that they are not a member of. Every role has workspaces holding forms
- where they are not the owner they also get a group carrying form permissions for that role:
  admin `form_admin`, member `form_designer` + `form_submitter`, viewer `submission_approver`.
  Form access comes only from group roles, so without it a workspace role grants nothing
- some workspaces have no accepted disclaimer and so hold no forms, which the service blocks
- forms cover published, draft with a schema, and draft never provisioned
- submissions cover `opened`, `draft`, and `submitted`, attributed to the owner, to dev users, and
  anonymously to the public user
- submitter audiences cover `protected` (the bootstrap default), `public`, and `none`

Generated users sit on active login providers (`azureidir`, `bceidbusiness`) with fabricated
subjects, so they cannot sign in. They exist to fill member lists, groups, and role assignments.

## Layout

| File                                     | Role                                                     |
| ---------------------------------------- | -------------------------------------------------------- |
| [`plan.ts`](./plan.ts)                   | What gets created, as data. No DB, no engine, no clock    |
| [`generate.ts`](./generate.ts)           | Runs the plan through the services, returns a manifest    |
| [`purge.ts`](./purge.ts)                 | Removes it all, engine documents included                 |
| [`fixtures/`](./fixtures)                | Form definitions and answers matching their components    |
| [`ownerFile.ts`](./ownerFile.ts)         | Reads and writes `.devdata-owner`, creates the owner      |
| [`resolveUser.ts`](./resolveUser.ts)     | Looks the owner up by username                            |
| [`preconditions.ts`](./preconditions.ts) | Checks the database is migrated and seeded                |
| [`guard.ts`](./guard.ts)                 | Refuses to run unless the dev-data feature is on          |
| [`runs.ts`](./runs.ts)                   | Records each run's ids in `soba.dev_data_run` as it goes  |
| [`cli.ts`](./cli.ts)                     | Argument parsing, output, exit codes                      |

`generate()` and `purge()` take options and return results, with no argv, console, or process exit,
so an admin API route can drive them unchanged.

## Notes for anyone changing this

- Answers must match component keys. Form.io drops submission `data` keys that are not components,
  so a mismatched fixture yields empty submissions rather than an error. The fixture tests pin this.
- Values come from a row index, not from randomness, so a failing test reproduces tomorrow.
- Forms, versions, and submissions go through their services, because they are two-sided: a
  Postgres row without its engine document is broken. Workspaces, groups, audience, and users are
  direct repo calls, bypassing checks the API applies (workspace creation would reject the BCeID
  dev users). The generated set is therefore not guaranteed to be reproducible through the API.
- Purge order: read engine refs, purge Postgres in one transaction, then delete engine documents
  best-effort. The reverse leaves live rows pointing at documents that are gone.
- Every save and submit creates a new engine document, so purge collects refs from
  `submission_revision` as well as from the submission row.
- A new table carrying `workspace_id` must be added to `WORKSPACE_SCOPED_TABLES` and to
  `purgeWorkspaceScoped`, or purge aborts on its foreign key. A test compares that list against the
  schema, so a missing name fails; it cannot tell whether the delete itself was written.
- Tables with a foreign key to `app_user` have the same requirement against
  `APP_USER_SCOPED_TABLES`, checked by the same test.
