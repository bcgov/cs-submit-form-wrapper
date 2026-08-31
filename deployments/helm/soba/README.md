# SOBA Helm Chart

Deploys the SOBA application stack: **backend** (Express API), **frontend** (Next.js),
and optionally **Form.io** with **MongoDB**.

## Why a Custom Chart

An existing [bcgov/helm-charts formio chart](https://github.com/bcgov/helm-charts/tree/master/charts/formio)
is available but does not meet the requirements of this project. After reviewing
its templates and values, the following limitations were identified:

**No Kubernetes Secrets.** The bcgov chart passes all credentials — MongoDB root
password, Form.io admin password, JWT secret, and the full `NODE_CONFIG` JSON — as
plaintext environment variables in Deployment specs. There are no Secret resources
in the chart. Credentials are visible in `kubectl get deployment -o yaml` output
and in pod specs.

**NODE_CONFIG must be manually assembled.** The chart expects a raw JSON string for
`nodeConfig` that includes the MongoDB connection URI and JWT secret. Users must
hand-construct this value with embedded credentials. The SOBA chart builds
`NODE_CONFIG` dynamically from component values and injects secrets from Kubernetes
Secret resources.

**MongoDB uses a Deployment, not a StatefulSet.** The chart deploys MongoDB as a
`Deployment` backed by two PVCs (init scripts + data). Deployments do not provide
stable network identities, ordered pod management, or safe scaling — properties
required for a database workload. Scaling the replica count would cause multiple
pods to compete for the same PVC. A StatefulSet with per-pod PersistentVolumeClaims
is the correct abstraction for MongoDB.

**No path to high availability.** The single-pod Deployment model cannot support
MongoDB replica sets. There is no mechanism for horizontal scaling or failover.
As SOBA's availability requirements grow, we need a MongoDB deployment model
that can evolve toward replica sets or a managed service.

**Labels do not follow Kubernetes conventions.** The chart uses `app:` and
`release:` labels rather than the standard `app.kubernetes.io/*` label taxonomy.
This prevents consistent label selectors across NetworkPolicies, monitoring,
and service meshes when Form.io and MongoDB are deployed alongside the SOBA
backend and frontend.

**No data protection on uninstall.** PVCs have no `helm.sh/resource-policy: keep`
annotation, so `helm uninstall` deletes MongoDB data. The SOBA chart retains
secrets and PVCs by default and provides an explicit `forceCleanup` flag for
controlled teardown.

**Legacy chart API.** The chart uses Helm v2's `apiVersion: v1` and includes
infrastructure-specific defaults (Trident storage annotations) that would require
overriding in our environment.

By managing Form.io and MongoDB as internal templates within the SOBA chart, we
gain control over secret generation, label consistency, network policy integration,
data retention, and the ability to swap between internal and external backing
services without changing the chart structure.

## Prerequisites

- Helm 3.x
- Kubernetes 1.24+
- **PostgreSQL** — the database is **not** included in this chart and must be
  provisioned separately (managed service, Bitnami sub-chart, CrunchyDB operator, etc.)

## Chart Structure

```
templates/
├── _helpers.tpl                 # Naming, labels, URL helpers
├── networkpolicy.yaml           # Inter-component + ingress traffic rules
├── secrets/
│   ├── db-secret.yaml           # DATABASE_URL or DB_PASSWORD
│   └── formio-secret.yaml       # Form.io admin creds, JWT secret, NODE_CONFIG
├── backend/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── route.yaml               # OpenShift Route (enabled by default)
│   ├── ingress.yaml             # Kubernetes Ingress (disabled by default)
│   ├── hpa.yaml                 # HorizontalPodAutoscaler
│   ├── migration-job.yaml       # Pre-install/pre-upgrade: drizzle migrate + seed
│   ├── configmap-app.yaml       # General app config
│   ├── configmap-formio.yaml    # Form.io plugin config
│   ├── configmap-document-generation.yaml # Document generation plugin config
│   ├── configmap-sso.yaml       # SSO / JWT config
│   ├── configmap-ratelimit.yaml # Rate limiting config
│   └── configmap-storage.yaml   # Files feature + storage profiles config
├── frontend/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── route.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   └── configmap.yaml
├── formio/
│   ├── deployment.yaml          # Only when formio.internal.enabled=true
│   ├── service.yaml
│   └── configmap.yaml
└── mongodb/
    ├── statefulset.yaml         # Only when mongodb.internal.enabled=true
    └── service.yaml
```

## Frontend API bootstrap

The frontend ConfigMap wires two base URLs (see `frontend/src/shared/config/runtimeConfig.ts`):

| Variable                        | Purpose                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SOBA_API_BASE_URL` | Browser / client — public HTTPS URL from `soba.backendHost` (Route or Ingress).                                                    |
| `SOBA_API_INTERNAL_URL`         | Next.js server (SSR) — cluster Service DNS: `http://<release>-backend.<namespace>.svc.cluster.local:<backend.service.port>/api/v1` |

Override the internal URL with `frontend.internalApiBaseUrl` if you use a mesh, split namespaces, or a different Service name.

## Database Configuration

PostgreSQL must be running and reachable before deploying. The chart supports two
configuration styles:

### Option 1: Full connection URI

Provide a complete `DATABASE_URL`. This takes precedence over component values.

```bash
helm upgrade --install my-soba ./deployments/helm/soba \
  --set database.uri="postgresql://user:password@db-host:5432/soba"
```

### Option 2: Individual components

Provide host, port, user, password, and database name separately. The backend
constructs the connection string at runtime.

```bash
helm upgrade --install my-soba ./deployments/helm/soba \
  --set database.host=my-postgres \
  --set database.port=5432 \
  --set database.user=postgres \
  --set database.password=secret \
  --set database.name=soba
```

### Where values end up

Database values are split across a **ConfigMap** and a **Secret**. For a release
named `my-soba`:

| Value                    | Default    | Resource                        | Key                 | Description                                    |
| ------------------------ | ---------- | ------------------------------- | ------------------- | ---------------------------------------------- |
| `database.uri`           | `""`       | Secret `my-soba-db`             | `DATABASE_URL`      | Full PostgreSQL URI (takes precedence)         |
| `database.host`          | `""`       | ConfigMap `my-soba-backend-app` | `DB_HOST`           | Hostname (used when `uri` is empty)            |
| `database.port`          | `"5432"`   | ConfigMap `my-soba-backend-app` | `DB_PORT`           | Port                                           |
| `database.user`          | `postgres` | ConfigMap `my-soba-backend-app` | `DB_USER`           | Username                                       |
| `database.password`      | `""`       | Secret `my-soba-db`             | `DB_PASSWORD`       | Password (random 24-char generated if omitted) |
| `database.name`          | `soba`     | ConfigMap `my-soba-backend-app` | `DB_NAME`           | Database name                                  |
| `database.adminDatabase` | `postgres` | ConfigMap `my-soba-backend-app` | `DB_ADMIN_DATABASE` | Admin database for migration CREATE DATABASE   |
| `database.poolMax`       | `"10"`     | ConfigMap `my-soba-backend-app` | `DB_POOL_MAX`       | Max connection pool size                       |

When `database.uri` is set, the component values (`host`, `port`, `user`, `name`)
are **not** written to the ConfigMap — the backend uses `DATABASE_URL` from the
Secret exclusively. `DB_PASSWORD` is only written to the Secret when `database.uri`
is empty.

## Document Generation Configuration

Document-generation plugin configuration is split between ConfigMap (non-secret)
and Vault/Kubernetes Secret (secret) values.

### Non-secret values (ConfigMap `<fullname>-backend-document-generation`)

| Helm value                                     | Env var                            | Used by                  |
| ---------------------------------------------- | ---------------------------------- | ------------------------ |
| `backend.config.documentGenerationDefaultCode` | `DOCUMENT_GENERATION_DEFAULT_CODE` | default backend resolver |
| `backend.documentGeneration.cdogsV2.endpoint`  | `PLUGIN_CDOGS_V2_ENDPOINT`         | cdogs-v2 adapter         |
| `backend.documentGeneration.cdogsV2.tokenUrl`  | `PLUGIN_CDOGS_V2_TOKEN_URL`        | cdogs-v2 adapter         |
| `backend.documentGeneration.cdogsV3.endpoint`  | `PLUGIN_CDOGS_V3_ENDPOINT`         | cdogs-v3 adapter         |

### Secret values (Vault template in backend Deployment)

| Vault key                       | Env var                         |
| ------------------------------- | ------------------------------- |
| `PLUGIN_CDOGS_V2_CLIENT_ID`     | `PLUGIN_CDOGS_V2_CLIENT_ID`     |
| `PLUGIN_CDOGS_V2_CLIENT_SECRET` | `PLUGIN_CDOGS_V2_CLIENT_SECRET` |

## Database Migration

On every `helm install` and `helm upgrade`, a Kubernetes Job runs **before** the
app pods start (Helm `pre-install,pre-upgrade` hook). The Job:

1. Creates the database if it doesn't exist (via `DB_ADMIN_DATABASE`)
2. Runs Drizzle schema migrations
3. Seeds reference data (roles, statuses, features, system user)
4. Applies per-environment feature status (see below)

The seed is fully idempotent (`ON CONFLICT DO NOTHING`), so it's safe to run on
every deploy.

To disable automatic migration:

```bash
--set backend.migration.enabled=false
```

## Feature Status per Environment

Migrations insert each feature with the same status everywhere. `backend.features`
overrides that per environment, rendered into the migration Job's `env` and
applied to `soba.feature` by the seed step.

It is rendered inline rather than through a ConfigMap because the Job is a
`pre-install,pre-upgrade` hook, and Helm creates hook resources before
ConfigMaps.

| Helm value                       | Env var                     | Effect                          |
| -------------------------------- | --------------------------- | ------------------------------- |
| `backend.features.<code>: ""`    | `FEATURE_<CODE>_STATUS=""`  | leave the migrated status alone |
| `backend.features.<code>: "..."` | `FEATURE_<CODE>_STATUS=...` | set the feature to that status  |

Values are quoted `feature_status` codes: `enabled`, `disabled`, `experimental`,
`deprecated`. Anything else fails `helm template`, including an unquoted `false`
or `off`, which YAML would otherwise turn into "no opinion".

The value is applied by the seed inside the migration Job, so it takes effect on
the next deploy rather than immediately, and the stored status is what the
application reads thereafter.

```bash
# enable the development data generator in a PR or dev namespace
--set backend.features.dev-data=enabled
```

`dev-data` gates `pnpm db:dev-data` and must stay disabled in production.

## Internal Sub-Charts

Form.io and MongoDB are managed as **internal components** — not Helm sub-chart
dependencies, but templates within this chart that are conditionally rendered.

### Form.io

| Mode                   | Configuration                                                       | What happens                                       |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| **Internal** (default) | `formio.internal.enabled=true`                                      | Deploys a Form.io pod + service inside the release |
| **External**           | `formio.internal.enabled=false` + `formio.external.url=https://...` | No Form.io pods; backend connects to external URL  |

### MongoDB

| Mode                   | Configuration                                                           | What happens                                      |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| **Internal** (default) | `mongodb.internal.enabled=true`                                         | Deploys a MongoDB StatefulSet with a PVC          |
| **External**           | `mongodb.internal.enabled=false` + `mongodb.external.uri=mongodb://...` | No MongoDB pods; Form.io connects to external URI |

## Networking: Routes vs. Ingress

The chart supports both **OpenShift Routes** (default) and **Kubernetes Ingress**.

| Platform   | Configuration                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| OpenShift  | `backend.route.enabled=true` (default), `frontend.route.enabled=true` (default)                           |
| Kubernetes | `backend/frontend.route.enabled=false`, `backend/frontend.ingress.enabled=true`, `ingressClassName=nginx` |

Both backend and frontend have independent `route` and `ingress` settings — set
them in pairs.

Hostnames are derived from the release name and `global.domain`:

- **Frontend:** one host per `frontend.apps` entry, `<fullname>-<name>.<domain>`
  (e.g. `soba-dev-designer.apps.gov.bc.ca`, `soba-dev-forms.apps.gov.bc.ca`).
  Override a single app with `frontend.apps.<name>.host` (PR slots pin the host this way).
- **Backend API:** `<fullname>-api.<domain>` (e.g. `soba-pr-42-api.apps.gov.bc.ca`)

Each `frontend.apps` entry renders its own Deployment/Service/Route/ConfigMap from the
same image, differing only by `featuresAllowed` (the mode). The backend `CORS_ORIGIN`
defaults to the origins of all enabled frontend apps; set `backend.config.corsOrigin`
to override.

### Route annotations

HAProxy is tuned through Route annotations. Most take the `haproxy.router.openshift.io/` prefix (`timeout`, `balance`, `hsts_header`, `disable_cookies`, `rate-limit-connections`); cookie naming is `router.openshift.io/cookie_name`. A mistyped key is ignored silently.

| Value                                    | Applies to                        |
| ---------------------------------------- | --------------------------------- |
| `backend.route.annotations`              | the API Route and every extraPath |
| `backend.route.extraPaths[].annotations` | one API path                      |
| `frontend.route.annotations`             | every frontend app's Route        |
| `frontend.apps.<name>.route.annotations` | one app                           |

The narrower map wins on conflict. Values are rendered quoted, so `true` and `120` are safe to write unquoted.

```yaml
frontend:
  route:
    annotations:
      haproxy.router.openshift.io/hsts_header: max-age=31536000;includeSubDomains
  apps:
    forms:
      route:
        annotations:
          haproxy.router.openshift.io/timeout: "180s"
```

`timeout` is inactivity, not total duration: a streaming upload does not trip it, a request going quiet while the backend works does.

#### extraPaths

One Route means one timeout for the whole API. `extraPaths` adds Routes on the same host scoped to a path, each its own HAProxy backend, matched longest path first with the base Route as the catch-all.

```yaml
backend:
  route:
    annotations:
      haproxy.router.openshift.io/timeout: "60s"
    extraPaths:
      - name: files
        path: /api/v1/submit/files
        annotations:
          haproxy.router.openshift.io/timeout: "300s"
```

That is what the chart ships: uploads at 300s, everything else at 60s. An upload writes nothing back until clamd finishes scanning (`clamav.timeoutMs`, 60s), so the router's 30s default would 504 a clean upload.

Matching is by whole segment and prefix only — `/api/v1/submit/files` does not capture
`/api/v1/submit/filestore`, and there is no suffix match. Document generation cannot be scoped this way: it sits at `/api/v1/submit/submissions/:id/{preview,print}`,and the only prefix reaching it would swallow ordinary submission reads and writes. It is a synchronous call to CDOGS, so the base timeout has to cover it.

`name` and `path` are required. `name` becomes the Route name and the `app.kubernetes.io/component` label, so it must be lowercase DNS-1123 and short enough to keep that label under 63 characters; duplicates are refused. `path` must start with `/` and needs `edge` or `reencrypt` termination, as `passthrough` cannot match on path. Host, Service and TLS come from the base Route. Each rule fails the render naming the entry.

## Secrets Management

Secrets use a **generate-once, keep-forever** strategy:

1. On first install, if no values are provided for passwords/JWT secrets, the chart
   generates random values (`randAlphaNum`) and stores them in Kubernetes Secrets.
2. On subsequent upgrades, the chart uses `lookup` to find the existing Secret and
   **preserves its data** — even if you don't pass the password again.
3. Secrets are annotated with `helm.sh/resource-policy: keep`, so `helm uninstall`
   does **not** delete them.

This prevents accidental credential rotation on upgrades and protects secrets from
being lost on uninstall.

### Managed secrets

| Secret              | Contents                                                |
| ------------------- | ------------------------------------------------------- |
| `<fullname>-db`     | `DATABASE_URL` or `DB_PASSWORD`                         |
| `<fullname>-formio` | Form.io admin email/password, JWT secret, `NODE_CONFIG` |

## Environment Value Files

| File               | Purpose        | Replicas    | Form.io  | MongoDB          |
| ------------------ | -------------- | ----------- | -------- | ---------------- |
| `values.yaml`      | Base defaults  | 1           | Internal | Internal         |
| `values-pr.yaml`   | PR review apps | 1           | Internal | Internal (256Mi) |
| `values-dev.yaml`  | Development    | 1           | Internal | Internal         |
| `values-test.yaml` | Test / UAT     | 2           | Internal | Internal (2Gi)   |
| `values-prod.yaml` | Production     | 3 (HPA 3–6) | External | External         |

## Examples

### PR review environment (OpenShift)

```bash
helm upgrade --install pr-42 ./deployments/helm/soba \
  -f deployments/helm/soba/values-pr.yaml \
  --set global.domain=apps.gov.bc.ca \
  --set backend.image.tag=pr-42 \
  --set frontend.image.tag=pr-42 \
  --set database.host=soba-db-postgresql \
  --set database.password=secret
```

### Development environment (OpenShift)

```bash
helm upgrade --install dev ./deployments/helm/soba \
  -f deployments/helm/soba/values-dev.yaml \
  --set global.domain=apps.gov.bc.ca \
  --set backend.image.tag=main \
  --set frontend.image.tag=main \
  --set database.host=soba-db-postgresql \
  --set database.password=secret
```

### Production (OpenShift)

```bash
helm upgrade --install prod ./deployments/helm/soba \
  -f deployments/helm/soba/values-prod.yaml \
  --set global.domain=apps.gov.bc.ca \
  --set database.uri="postgresql://user:pass@managed-pg:5432/soba" \
  --set backend.image.tag=v1.2.3 \
  --set frontend.image.tag=v1.2.3
```

### Disable migration (e.g. when running migrations in a separate CI step)

```bash
helm upgrade --install my-soba ./deployments/helm/soba \
  --set backend.migration.enabled=false \
  ...
```

## Cleanup

### Standard uninstall

```bash
helm uninstall my-release
```

This removes all resources **except** Secrets and PVCs (retained by the `keep`
resource policy).

### Full purge (including retained Secrets and PVCs)

Option 1 — Deploy with `forceCleanup` first, then uninstall:

```bash
helm upgrade my-release ./deployments/helm/soba \
  --set global.forceCleanup=true \
  --reuse-values

helm uninstall my-release
```

Option 2 — Uninstall, then delete retained resources by label:

```bash
helm uninstall my-release
kubectl delete secret,pvc -l app.kubernetes.io/instance=my-release
```

### What `forceCleanup` does

When `global.forceCleanup=true`, the `helm.sh/resource-policy: keep` annotation is
removed from Secrets and PVCs. This allows `helm uninstall` to delete them normally.

| `forceCleanup`    | `helm uninstall` behaviour                        |
| ----------------- | ------------------------------------------------- |
| `false` (default) | Secrets and PVCs are **retained**                 |
| `true`            | Secrets and PVCs are **deleted** with the release |
