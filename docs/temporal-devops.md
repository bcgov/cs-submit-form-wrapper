# Temporal on OpenShift for SOBA

This document describes how Temporal is currently installed and used for SOBA in the OpenShift namespace pattern `acf456-xx` and what must change when the newer upstream Temporal Helm chart line moves from release candidate to the supported stable release.

This guide is intended for:

- Developers working on CI/CD, Helm, or Temporal worker code
- Testers validating PR and `develop` deployments
- Platform operators troubleshooting Temporal inside the shared namespace

Examples below use `acf456-dev`, but the same deployment pattern applies to the `acf456-xx` namespace family.

## Executive Summary

SOBA currently uses a shared, namespace-level Temporal server plus per-application Temporal workers:

- One shared Temporal release named `temporal` is installed into the OpenShift namespace
- Each PR gets its own Temporal namespace such as `soba-pr-46`
- Each SOBA release gets its own application worker deployment such as `soba-pr-46-temporal-worker`
- The shared Temporal server uses Crunchy Postgres databases `temporal` and `temporal_visibility`
- PR cleanup deletes the PR-specific Temporal namespace and SOBA release, but keeps the shared Temporal server in place

Today, CI installs Temporal from the published Helm repository using chart `0.74.0`. The checked-out `helm-charts` repository in the workspace is not what CI deploys today; it is the upstream newer chart line and should be treated as the migration reference for the next upgrade.

## Current Deployment Model

### Shared components per OpenShift namespace

The shared Temporal deployment is installed once per namespace and is reused by all PR releases in that namespace.

Current shared Temporal services and pods are expected to include:

- `temporal-frontend`
- `temporal-history`
- `temporal-matching`
- `temporal-worker` for the Temporal server internals, not the SOBA application worker
- `temporal-web`
- `temporal-admintools`
- schema jobs created by the chart

### Per-PR SOBA components

For each pull request deployment, SOBA adds:

- `soba-pr-<N>-backend`
- `soba-pr-<N>-frontend`
- `soba-pr-<N>-formio`
- `soba-pr-<N>-mongodb`
- `soba-pr-<N>-temporal-worker`

Each PR also gets a dedicated Temporal namespace inside the shared server:

- `soba-pr-45`
- `soba-pr-46`
- and so on

This design keeps Temporal infrastructure shared while isolating workflow state by namespace.

## What Has Already Been Implemented

### 1. PR deployments now install shared Temporal automatically

The PR deployment workflow in `.github/workflows/pr_open.yaml` does all of the following:

- Builds SOBA images
- Deploys or reconciles Crunchy Postgres
- Runs `helm upgrade --install temporal temporal` against `https://go.temporal.io/helm-charts`
- Uses `deployments/helm/temporal/values.yaml` for the Temporal values
- Waits for Temporal schema jobs and `temporal-frontend`
- Ensures the PR-specific Temporal namespace exists
- Deploys the SOBA Helm release with the Temporal address and namespace injected
- Waits for the SOBA Temporal worker rollout

This means a PR deploy is no longer just an app deployment. It is also responsible for ensuring the shared Temporal control plane exists in the target namespace.

### 2. SOBA has a dedicated Temporal worker image

SOBA no longer relies on the backend image for Temporal worker execution. A dedicated worker image is built from `backend/Dockerfile.temporal-worker`.

Why this was done:

- The Temporal TypeScript SDK depends on `@temporalio/core-bridge`
- That native dependency requires a glibc-based runtime
- Alpine-based images are not reliable for this workload

What the dedicated worker image does:

- Uses `node:lts-slim`
- Installs backend dependencies
- Builds the backend TypeScript output
- Starts `backend/dist/temporal-worker.js`
- Remains compatible with OpenShift arbitrary UID behavior

This is the key application-side change that made the SOBA worker stable on OpenShift.

### 3. Image build and publish now include `temporal-worker`

The reusable workflow `.github/workflows/build-images.yaml` now builds and publishes three image families:

- `backend`
- `frontend`
- `temporal-worker`

For each image family, the workflow:

- builds per-platform images
- uploads digests
- merges them into a final manifest image
- tags images with `sha-<short_sha>`
- tags environment-oriented aliases such as `pr-<N>` or `develop`

### 4. SOBA Helm values support Temporal worker deployment

The SOBA Helm chart under `deployments/helm/soba` now includes:

- a `temporal` config block for shared connection settings
- a `temporalWorkers` array for dedicated worker deployments
- a `templates/temporal/configmap.yaml` that injects:
  - `TEMPORAL_ALLOWED`
  - `TEMPORAL_ADDRESS`
  - `TEMPORAL_NAMESPACE`
  - `TEMPORAL_TASK_QUEUE`
- a `templates/temporal/deployment-worker.yaml` that deploys the SOBA worker as its own Deployment, with:
  - secret wiring that matches the backend (DB via `existingSecretName`/`secretKeyRef`, Form.io gated behind Vault)
  - HTTP health endpoints (`/readyz`, `/healthz`) on each worker's `healthPort` (for example `9090` and `9091`) backed by readiness and liveness probes

Current enablement pattern:

- `values.yaml`: disabled by default
- `values-pr.yaml`: enabled
- `values-dev.yaml`: enabled
- `values-test.yaml` / `values-prod.yaml`: not yet enabled (see TEST/PROD follow-up)

### 5. PR cleanup removes PR-specific Temporal namespaces

The cleanup workflow `.github/workflows/pr_close.yaml` now:

- deletes the Temporal namespace `soba-pr-<N>` through `temporal-admintools`
- uninstalls the PR-specific SOBA Helm release
- removes the PR-specific Crunchy user and database resources

It does not uninstall the shared `temporal` release. That is intentional.

## Current Shared Temporal Server Configuration

The file `deployments/helm/temporal/values.yaml` defines the current Temporal server deployment used by PR CI.

### Current chart and image line

- Helm repo: `https://go.temporal.io/helm-charts`
- Chart version in CI today: `0.74.0` by default
- Release name: `temporal`
- Server image: `temporalio/server:1.30.3`

The workflow allows override via the repository variable `TEMPORAL_CHART_VERSION`, but defaults to `0.74.0`.

### Current persistence model

Temporal uses Crunchy Postgres with two SQL databases:

- `temporal`
- `temporal_visibility`

Current connection characteristics:

- host: `pg-soba-crunchy-primary`
- port: `5432`
- user: `temporal`
- secret: `pg-soba-crunchy-pguser-temporal`

### Current non-bundled dependency posture

The current values explicitly disable bundled sub-chart style dependencies:

- Cassandra
- MySQL
- Elasticsearch
- Prometheus
- Grafana

That matches the current SOBA platform model where external platform services are used instead of chart-managed databases and monitoring stacks.

### Current server features enabled

- Temporal Web UI enabled
- Temporal AdminTools enabled
- schema creation and update jobs enabled
- database creation disabled

This is consistent with:

- platform-managed Postgres databases and credentials
- chart-managed Temporal schema setup and schema upgrades

## Current PR Deployment Flow

The current PR flow is:

1. Build `backend`, `frontend`, and `temporal-worker` images
2. Reconcile Crunchy Postgres
3. Install or upgrade the shared `temporal` release
4. Wait for Temporal to finish schema work and come up
5. Create or confirm the Temporal namespace `soba-pr-<N>`
6. Deploy the SOBA release
7. Inject:
   - `temporal.address = temporal-frontend.<namespace>.svc.cluster.local:7233`
   - `temporal.namespace = soba-pr-<N>`

- `temporalWorkers[*].image.repository = ghcr.io/<repo>/temporal-worker`
- `temporalWorkers[*].image.tag = sha-<short_sha>`

8. Wait for `backend`, `frontend`, `formio`, `mongodb`, and `temporal-worker`
9. Run Playwright tests

This is the most complete and correct Temporal deployment path in the repository today.

## Current Gaps and Operational Notes

### 1. `develop` deployment is now at PR parity

The `develop` deployment workflow in `.github/workflows/on-merge.yaml` now mirrors the full PR Temporal flow. Both `pr_open.yaml` and `on-merge.yaml` call the shared composite action `.github/actions/temporal-deploy`, which:

- installs or upgrades the shared `temporal` release (idempotent `helm upgrade --install`)
- waits for schema jobs (only when present, so real failures are no longer masked by `|| true`)
- waits for `temporal-frontend` and `temporal-admintools` rollouts
- ensures the environment's Temporal namespace exists (`soba-pr-<N>` for PRs, `soba-dev` for dev)

In addition, `on-merge.yaml` now:

- overrides the `temporalWorkers[*]` image tag to the just-built `sha-<short_sha>`
- injects `temporal.address` (`temporal-frontend.<namespace>.svc.cluster.local:7233`) and `temporal.namespace` (`soba-dev`) into the Helm values override
- waits for the `soba-dev-temporal-worker` rollout

Worker rollout is now meaningful: the worker exposes HTTP health endpoints (`/readyz`, `/healthz`) and the Deployment has a readiness probe, so `oc rollout status` only succeeds once the worker has actually connected to the Temporal frontend.

### 2. Secret rotation recovery (runbook)

The shared Temporal server caches its Postgres credentials. After the Crunchy `temporal` user password rotates, `temporal-frontend` and `temporal-matching` keep running with the stale credentials until restarted.

Symptoms:

- `pq: password authentication failed for user "temporal"`
- Temporal Web UI `503` from `/api/v1/namespaces`
- `Not enough hosts to serve the request`

Automated handling:

- the `.github/actions/temporal-deploy` action detects this during the namespace-ensure step. If the `temporal operator namespace` command fails (the stale-credential symptom), it automatically runs `oc rollout restart` on `temporal-frontend` and `temporal-matching`, waits for them, and retries.

Manual recovery (if needed outside CI):

```bash
oc rollout restart deployment/temporal-frontend deployment/temporal-matching -n acf456-dev
oc rollout status deployment/temporal-frontend -n acf456-dev --timeout=300s
oc rollout status deployment/temporal-matching -n acf456-dev --timeout=300s
```

This is the first operational response after any Temporal DB password rotation.

### 3. The shared server is namespace-scoped, not cluster-global

This documentation should keep emphasizing that Temporal is shared within an OpenShift namespace, not across all namespaces. `acf456-dev` has its own shared Temporal release. Another namespace would require its own shared deployment unless platform architecture changes.

## What the Local `helm-charts` Repo Means

The checked-out repository at `../helm-charts` is important, but it is not the chart source used by current CI.

What it tells us:

- the upstream chart in that checkout is currently `1.0.0-rc.3`
- its `appVersion` is `1.30.2`
- it introduces a new persistence values structure
- it removes support for the old top-level database and monitoring keys

This repo should be treated as the upgrade target and migration reference, not as proof that SOBA already deploys the new chart line.

## What Must Change When the RC Chart Becomes the Supported Stable Release

Once the current upstream RC line becomes the supported stable release, the work is not just to bump the version. The current SOBA values file is still written in the old chart format.

### Required change 1. Update the chart version used by CI

Current state:

- PR CI defaults to `0.74.0`

Next step:

- update the repository variable `TEMPORAL_CHART_VERSION` or the workflow default in `.github/workflows/pr_open.yaml`
- move to the chosen stable `1.0.x` release after non-production validation

### Required change 2. Migrate `deployments/helm/temporal/values.yaml` to the new persistence format

The new chart expects persistence under:

`server.config.persistence.datastores`

The current SOBA values file still uses the old structure:

- `server.config.persistence.default`
- `server.config.persistence.visibility`
- old SQL field names such as `driver`, `host`, `port`, and `database`

The new chart expects SQL datastores shaped more like:

```yaml
server:
  image:
    repository: temporalio/server
    tag: 1.30.3
  config:
    persistence:
      defaultStore: default
      visibilityStore: visibility
      datastores:
        default:
          sql:
            createDatabase: false
            manageSchema: true
            pluginName: postgres12
            driverName: postgres12
            databaseName: temporal
            connectAddr: "pg-soba-crunchy-primary:5432"
            user: temporal
            existingSecret: pg-soba-crunchy-pguser-temporal
            maxConns: 20
            maxIdleConns: 20
            maxConnLifetime: "1h"
        visibility:
          sql:
            createDatabase: false
            manageSchema: true
            pluginName: postgres12
            driverName: postgres12
            databaseName: temporal_visibility
            connectAddr: "pg-soba-crunchy-primary:5432"
            user: temporal
            existingSecret: pg-soba-crunchy-pguser-temporal
            maxConns: 20
            maxIdleConns: 20
            maxConnLifetime: "1h"
```

This is the most important migration task.

### Required change 3. Remove deprecated top-level keys entirely

The new chart line does not accept the old top-level keys for bundled dependencies.

These keys must be removed from `deployments/helm/temporal/values.yaml`, not merely left present with `enabled: false`:

- `cassandra`
- `mysql`
- `elasticsearch`
- `prometheus`
- `grafana`

Why this matters:

- the newer chart validates deprecations during template rendering
- leaving these keys in place can fail the install or upgrade even when they are set to disabled

### Required change 4. Replace old schema flags with datastore-level schema management

Current SOBA values use:

```yaml
schema:
  createDatabase:
    enabled: false
  setup:
    enabled: true
  update:
    enabled: true
```

In the newer chart line:

- schema job resources still live under top-level `schema`
- schema execution behavior is controlled per datastore using:
  - `createDatabase`
  - `manageSchema`

For SOBA, the likely target is:

- `createDatabase: false`
- `manageSchema: true`

That keeps database ownership with Crunchy while allowing the chart to apply Temporal schema migrations.

### Required change 5. Disable compatibility shims for Temporal 1.30+

The newer chart line includes compatibility shims intended for 1.29-era images.

Because SOBA is already using Temporal `1.30.x`, the future stable values should explicitly review and likely set:

```yaml
shims:
  dockerize: false
  elasticsearchTool: false
```

This should be validated during the upgrade rehearsal.

### Required change 6. Re-test PR deployment and cleanup end to end

When the stable chart version is adopted, validate all of the following in a non-production namespace:

- shared Temporal install succeeds
- schema jobs complete successfully
- `temporal-frontend`, `temporal-history`, `temporal-matching`, `temporal-web`, `temporal-admintools`, and Temporal internal `worker` all come up
- PR namespace creation through `temporal-admintools` still works
- `soba-pr-<N>-temporal-worker` connects and polls successfully
- the Web UI returns `200` from `/api/v1/namespaces`
- PR cleanup still deletes the PR-specific Temporal namespace cleanly

### Required change 7. Bring `develop` deployment up to the same standard (DONE)

This has been completed independently of the chart upgrade. `on-merge.yaml` now:

- installs or reconciles the shared `temporal` release (via `.github/actions/temporal-deploy`)
- ensures `soba-dev` exists as a Temporal namespace
- injects the built `temporal-worker` image tag into the Helm override
- injects `temporal.address` and `temporal.namespace`
- waits for `soba-dev-temporal-worker` rollout

The install + namespace-ensure logic is shared with `pr_open.yaml` through the composite action so the two paths cannot drift.

## Recommended Rollout Plan for the Stable Chart Upgrade

1. Create a branch that only updates the Temporal chart version and `deployments/helm/temporal/values.yaml`.
2. Convert the values file to the new `datastores` structure.
3. Remove deprecated top-level keys.
4. Review shims for Temporal `1.30.x`.
5. Test the branch in a disposable non-production namespace.
6. Verify Web UI, PR namespace creation, worker polling, and cleanup behavior.
7. After validation, update `TEMPORAL_CHART_VERSION` to the stable version.
8. Update `on-merge.yaml` so dev matches PR behavior.

## TEST and PROD Enablement (Follow-up Phase)

Temporal is currently wired only for PR and `develop` (dev). TEST and PROD do not yet deploy the worker or the shared server. This is intentionally deferred, but documented here so the path is clear.

### TEST (`release-to-test.yaml`)

`values-test.yaml` has no `temporal`/`temporalWorkers` blocks, and `release-to-test.yaml` has no Temporal steps. To reach PR/dev parity:

- add `temporal` (with `allowed: "true"`, `namespace: "soba-test"`, `taskQueue: "soba"`) and `temporalWorkers` entries (`enabled: true`, image, resources) to `values-test.yaml`
- call the shared composite action in `release-to-test.yaml`:
  ```yaml
  - name: Deploy shared Temporal and ensure test namespace
    uses: ./.github/actions/temporal-deploy
    with:
      namespace: ${{ secrets.OC_NAMESPACE }}
      temporal_namespace: soba-test
      retention: "14d"
      chart_version: ${{ vars.TEMPORAL_CHART_VERSION || '0.74.0' }}
  ```
- inject `temporal.address`/`temporal.namespace` and the built `temporalWorkers[*].image` tags into the values override (mirror `on-merge.yaml`)
- add `deployment/soba-test-temporal-worker` to the rollout-status waits

### PROD

There is no PROD deploy workflow in the repository yet, so PROD Temporal enablement is a larger effort:

- create a PROD deploy workflow (mirroring `release-to-test.yaml`)
- add `temporal`/`temporalWorkers` blocks to `values-prod.yaml`
- the single shared `deployments/helm/temporal/values.yaml` is sized for non-production (single-replica frontend/history/matching, small resource limits). PROD should use a production-grade Temporal server values file: HA replicas for `frontend`, `history`, and `matching`, higher resource requests/limits, longer namespace retention, and a defined backup posture for the `temporal` and `temporal_visibility` databases.

### Per-environment Temporal server values

Today all environments share one `deployments/helm/temporal/values.yaml`. As TEST and especially PROD come online, split this into per-environment values files (for example `values-dev.yaml`, `values-test.yaml`, `values-prod.yaml` under `deployments/helm/temporal/`) and pass the right one to the composite action via its `values_file` input.

## Verification Commands

### Shared Temporal health

```bash
oc get pods -n acf456-dev | grep temporal
oc logs -n acf456-dev deployment/temporal-frontend --since=5m
oc logs -n acf456-dev deployment/temporal-matching --since=5m
```

### PR namespace validation

```bash
oc exec deployment/temporal-admintools -n acf456-dev -- \
  temporal operator namespace list

oc exec deployment/temporal-admintools -n acf456-dev -- \
  temporal operator namespace describe -n soba-pr-46
```

### Web UI validation

```bash
oc port-forward -n acf456-dev svc/temporal-web 8088:8080
curl -i http://localhost:8088/api/v1/namespaces
```

### SOBA worker validation

```bash
oc get deployment -n acf456-dev | grep temporal-worker
oc logs deployment/soba-pr-46-temporal-worker -n acf456-dev --since=5m
```

Healthy worker logs should show:

- connection to the configured Temporal frontend
- the expected namespace
- the expected task queue
- `Worker started, polling for tasks`

## Final Recommendation

The current OpenShift Temporal implementation is partly complete and already good enough for PR-based testing:

- shared Temporal server deployment exists
- PR namespace lifecycle exists
- dedicated SOBA worker image exists
- PR deployment path is mostly correct

The next meaningful work is not new feature work. It is upgrade hardening:

- migrate the Temporal values file to the new chart format
- adopt the stable `1.0.x` chart line after validation
- bring `develop` deployment to feature parity with PR deployment
- document secret-rotation recovery for `temporal-frontend` and `temporal-matching`

Once those items are done, the Temporal OpenShift story for SOBA will be much easier for developers and testers to understand, operate, and trust.
