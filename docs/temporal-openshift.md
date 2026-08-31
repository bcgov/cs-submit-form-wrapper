# Deploying Temporal on OpenShift

This document explains how the Temporal setup (described in [temporal.md](temporal.md)) translates to an OpenShift environment.

---

## What needs to be created

No Helm charts or OpenShift manifests exist in the repo yet. Before deployment can happen, the following files must be created.

### Helm chart structure

```
charts/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── configmap.yaml                  # TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, etc.
    ├── dynamicconfig-configmap.yaml    # Temporal server dynamic config (e.g. maxIDLength)
    ├── secret.yaml                     # Postgres credentials
    ├── temporal-deployment.yaml        # temporalio/auto-setup:1.24
    ├── temporal-service.yaml           # ClusterIP :7233 (internal only)
    ├── temporal-worker-deployment.yaml # backend image, node dist/temporal-worker.js
    ├── temporal-ui-deployment.yaml     # optional
    ├── temporal-ui-service.yaml        # optional
    └── temporal-ui-route.yaml          # optional OpenShift Route -for internal use
```

#### What each file does

**`configmap.yaml`**

Non-sensitive configuration shared across the Temporal server, API server, and worker. Helm injects values from `values.yaml` into it at deploy time.

```yaml
TEMPORAL_ADDRESS: temporal:7233 # how API server + worker find the Temporal server
TEMPORAL_NAMESPACE: default
TEMPORAL_TASK_QUEUE: soba
DB: postgres12 # Temporal server's DB driver
POSTGRES_SEEDS: <postgres-service-name> # DNS name of the existing app PostgreSQL Service
```

**`secret.yaml`**

Sensitive values — DB credentials. Either defined in the chart (kept out of git) or the chart references a pre-existing secret created manually with `oc create secret`. Never commit real credentials.

```yaml
POSTGRES_USER: temporal
POSTGRES_PWD: <password>
```

**`temporal-deployment.yaml`**

Runs `temporalio/auto-setup:1.24` — the Temporal server itself. On first start it runs schema migrations against the `temporal` database in the shared PostgreSQL instance, then begins serving gRPC on port 7233. This is the workflow engine — the job queue coordinator between the API server and the worker.

**`temporal-service.yaml`**

Gives the Temporal server a stable DNS name (`temporal`) at port 7233. Type `ClusterIP` — only reachable inside the cluster. Both the API server and the worker connect to `temporal:7233` through this Service. No OpenShift Route is created — gRPC must never be exposed externally.

**`temporal-worker-deployment.yaml`**

Runs the same backend image as the API server but with a different start command:

```yaml
command: ["node", "dist/temporal-worker.js"]
```

This is the process that actually executes your workflows and activities. It has no Service or Route — it only makes outbound connections to `temporal:7233` to poll for tasks.

**`temporal-ui-deployment.yaml`** _(optional)_

Runs `temporalio/ui:2.48.0` — a web dashboard to view running, completed, and failed workflows. Useful in dev and staging. Should be restricted or omitted in production.

**`temporal-ui-service.yaml`** _(optional)_

Exposes the UI pod on port 8080 within the cluster so the Route can reach it.

**`temporal-ui-route.yaml`** _(optional)_

OpenShift Route that exposes the UI externally over HTTPS. Should be access-restricted (network policy or auth proxy) since it exposes all workflow history and data.

#### How the files connect at runtime

```
[Route] → temporal-ui-service → temporal-ui pod
                                       │
                              temporal-service :7233
                                       │
                              temporal pod (server)
                                       │
                    existing postgres Service :5432
                    (database: "temporal", separate from "soba")

API server pod ──────────── temporal-service :7233
Worker pod ──────────────── temporal-service :7233
```

Services are what make everything addressable by name — without them, pods can only be reached by ephemeral IP addresses that change on every restart.

### GitHub Actions deploy workflow

```
.github/workflows/
└── deploy.yaml    # calls build-images.yaml then helm upgrade --install
```

The existing `build-images.yaml` already outputs `short_sha` and `image_version` for this purpose. A deploy workflow would look like:

```yaml
jobs:
  build:
    uses: ./.github/workflows/build-images.yaml
    with:
      ref: ${{ github.ref }}
      platforms: amd64
    secrets: inherit

  deploy:
    needs: build
    steps:
      - run: |
          helm upgrade --install soba ./charts \
            --set global.tag="sha-${{ needs.build.outputs.short_sha }}"
```

### `values.yaml` defaults

```yaml
global:
  tag: latest # overridden by CI with sha-xxxxx

temporal:
  image: temporalio/auto-setup:1.24
  namespace: default
  taskQueue: soba
  postgresSeeds: <postgres-service-name> # DNS name of the existing app PostgreSQL Service

worker:
  enabled: true
  replicas: 1

temporalUi:
  enabled: false # opt-in
```

### What does NOT need to change

- The backend `Dockerfile` — the worker reuses the same image with a different start command
- The CI build workflow — already tags and pushes images correctly
- Backend source code — the worker entry point already exists at `dist/temporal-worker.js`

---

## How it differs from local development

| Local (Docker Compose)                                                   | OpenShift                                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| All services in one `docker-compose.yml`                                 | Each service is a separate OpenShift Deployment                                    |
| `.env` / `.env.local` files                                              | ConfigMap (non-secret values) + Secret (passwords, tokens)                         |
| Ports accessible on `localhost`                                          | Services communicate via internal cluster DNS                                      |
| `pnpm temporal-worker:dev` from `backend/` (local)                       | Worker runs as a separate Deployment using the same backend image                  |
| No resource limits                                                       | Resource requests and limits required                                              |
| Temporal shares the main `postgres` container (port 5432, `temporal` db) | Temporal shares the existing PostgreSQL Service — same pattern, different DNS name |

---

## What needs to run in OpenShift

There are three new components (the app's existing PostgreSQL is reused):

1. **Temporal server** — the workflow engine, stores state in the `temporal` database on the existing PostgreSQL instance
2. **API server** — the existing SOBA backend (`dist/app.js`), unchanged
3. **Temporal worker** — same backend image, different start command (`dist/temporal-worker.js`)

The Temporal UI is optional and should only be exposed internally or to trusted users.

```
                         OpenShift cluster
┌──────────────────────────────────────────────────────┐
│                                                      │
│  [Route] → API server Deployment (dist/app.js)       │
│                  │                                   │
│                  │ gRPC (port 7233, internal only)    │
│                  ▼                                   │
│           Temporal server Deployment                 │
│                  │                                   │
│                  ▼                                   │
│      existing PostgreSQL Deployment (port 5432)      │
│      db: "soba" (app)   db: "temporal" (Temporal)    │
│                                                      │
│  Worker Deployment (dist/temporal-worker.js)         │
│       │ also connects to Temporal server via gRPC    │
│       └─────────────────────────────────────────────┘
```

---

## Step 1 — Create the `temporal` database in the existing PostgreSQL instance

Temporal uses the **same PostgreSQL instance** as the SOBA app but stores its state in a **separate database** named `temporal`. You do not need to deploy a new PostgreSQL service.

Create the database and a dedicated user before deploying the Temporal server:

```bash
# Port-forward to the existing postgres pod
oc port-forward svc/<postgres-service-name> 5432:5432

# Then in a separate terminal
psql -h localhost -U postgres -c "CREATE USER temporal WITH PASSWORD '<password>';"
psql -h localhost -U postgres -c "CREATE DATABASE temporal OWNER temporal;"
```

Minimum config:

- Database name: `temporal` (separate from the `soba` app database)
- User: `temporal`
- Password: store in a Secret (see Step 2)
- Host: the existing PostgreSQL Service DNS name
- Port: `5432`

---

## Step 2 — Dynamic config ConfigMap

The Temporal server requires a dynamic config file (same as `.devcontainer/config/temporal-dynamicconfig.yaml` in local dev). On OpenShift, mount it via a ConfigMap.

```yaml
# temporal-dynamicconfig-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: temporal-dynamicconfig
data:
  dynamic_config.yaml: |
    limit.maxIDLength:
      - value: 255
        constraints: {}
```

---

## Step 3 — Secrets and ConfigMap

Create a Secret for sensitive values and a ConfigMap for everything else.

```yaml
# temporal-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: temporal-secret
type: Opaque
stringData:
  POSTGRES_USER: temporal
  POSTGRES_PWD: <your-password>
```

```yaml
# temporal-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: temporal-config
data:
  DB: postgres12
  DB_PORT: "5432"
  POSTGRES_SEEDS: <postgres-service-name> # DNS name of the existing app PostgreSQL Service
  TEMPORAL_ADDRESS: temporal:7233 # DNS name of the temporal Service, port 7233
  TEMPORAL_NAMESPACE: default
  TEMPORAL_TASK_QUEUE: soba
  TEMPORAL_ALLOWED: "true"
```

Add `TEMPORAL_ADDRESS` and `TEMPORAL_ALLOWED` to your existing backend ConfigMap/Secret as well, so both the API server and the worker pick them up.

---

## Step 4 — Temporal server Deployment

The `temporalio/auto-setup` image initialises the database schema on first start and then runs the server. It uses the same image as local dev.

```yaml
# temporal-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: temporal
spec:
  replicas: 1
  selector:
    matchLabels:
      app: temporal
  template:
    metadata:
      labels:
        app: temporal
    spec:
      containers:
        - name: temporal
          image: temporalio/auto-setup:1.24
          ports:
            - containerPort: 7233
          env:
            - name: DB
              valueFrom:
                configMapKeyRef:
                  name: temporal-config
                  key: DB
            - name: DB_PORT
              valueFrom:
                configMapKeyRef:
                  name: temporal-config
                  key: DB_PORT
            - name: POSTGRES_SEEDS
              valueFrom:
                configMapKeyRef:
                  name: temporal-config
                  key: POSTGRES_SEEDS
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: temporal-secret
                  key: POSTGRES_USER
            - name: POSTGRES_PWD
              valueFrom:
                secretKeyRef:
                  name: temporal-secret
                  key: POSTGRES_PWD
            - name: DYNAMIC_CONFIG_FILE_PATH
              value: /etc/temporal/config/dynamicconfig/dynamic_config.yaml
          volumeMounts:
            - name: dynamicconfig
              mountPath: /etc/temporal/config/dynamicconfig
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
      volumes:
        - name: dynamicconfig
          configMap:
            name: temporal-dynamicconfig
---
apiVersion: v1
kind: Service
metadata:
  name: temporal
spec:
  selector:
    app: temporal
  ports:
    - port: 7233
      targetPort: 7233
  type: ClusterIP # internal only — not exposed outside the cluster
```

> Do **not** create an OpenShift Route for the Temporal server. The gRPC port (7233) should only be reachable from inside the cluster.

---

## Step 5 — Temporal worker Deployment

The worker uses the **same backend image** as the API server. The only difference is the start command.

```yaml
# temporal-worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: temporal-worker
spec:
  replicas: 1
  selector:
    matchLabels:
      app: temporal-worker
  template:
    metadata:
      labels:
        app: temporal-worker
    spec:
      containers:
        - name: worker
          image: ghcr.io/<your-org>/soba/backend:<tag>
          command: ["node", "dist/temporal-worker.js"]
          envFrom:
            - configMapRef:
                name: soba-backend-config # your existing backend ConfigMap
            - secretRef:
                name: soba-backend-secret # your existing backend Secret
          env:
            # Override/add Temporal-specific values
            - name: TEMPORAL_ADDRESS
              valueFrom:
                configMapKeyRef:
                  name: temporal-config
                  key: TEMPORAL_ADDRESS
            - name: TEMPORAL_ALLOWED
              value: "true"
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
```

The worker does **not** need a Service or Route — it only makes outbound connections to the Temporal server.

---

## Step 6 — Temporal UI (optional-Important for HELM)

The UI is useful for monitoring workflows. Expose it only to internal users (e.g. via an OpenShift Route with network policy restrictions, or port-forward for ad-hoc access).

```yaml
# temporal-ui-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: temporal-ui
spec:
  replicas: 1
  selector:
    matchLabels:
      app: temporal-ui
  template:
    metadata:
      labels:
        app: temporal-ui
    spec:
      containers:
        - name: ui
          image: temporalio/ui:2.48.0
          ports:
            - containerPort: 8080
          env:
            - name: TEMPORAL_ADDRESS
              valueFrom:
                configMapKeyRef:
                  name: temporal-config
                  key: TEMPORAL_ADDRESS
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
---
apiVersion: v1
kind: Service
metadata:
  name: temporal-ui
spec:
  selector:
    app: temporal-ui
  ports:
    - port: 8080
      targetPort: 8080
---
# Optional Route — restrict access via network policy or annotations
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: temporal-ui
spec:
  to:
    kind: Service
    name: temporal-ui
  port:
    targetPort: 8080
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect
```

---

## Environment variable reference

These variables must be set on both the API server and the worker Deployment.

| Variable              | Value in OpenShift | Notes                                                                   |
| --------------------- | ------------------ | ----------------------------------------------------------------------- |
| `TEMPORAL_ALLOWED`    | `true`             | Must be explicitly set to `true`                                        |
| `TEMPORAL_ADDRESS`    | `temporal:7233`    | Uses internal cluster DNS (`<service-name>:<port>`)                     |
| `TEMPORAL_NAMESPACE`  | `default`          | Change only if you set up a custom namespace in Temporal                |
| `TEMPORAL_TASK_QUEUE` | `soba`             | Default queue; workers can override this env var for specialized queues |

---

## Deployment order

Services have startup dependencies. Deploy in this order:

1. Ensure the existing PostgreSQL instance is healthy and the `temporal` database + user have been created (Step 1)
2. `temporal` (Temporal server) — `auto-setup` runs schema migrations on first start
3. `temporal-worker` — can start once the Temporal server is reachable
4. API server — can start in parallel with the worker

---

## Scaling the worker

Each worker replica polls the task queue independently. You can scale horizontally by increasing replicas:

```bash
oc scale deployment/temporal-worker --replicas=3
```

Temporal distributes tasks across all available workers automatically. There is no coordination needed between worker replicas.

> Note: the Temporal server itself (`temporalio/auto-setup:1.24`) is not designed for multi-replica deployments. For high-availability Temporal, use Temporal Cloud or a separately configured multi-node Temporal cluster.

---

## Health checks

The Temporal server exposes a gRPC health check. The worker and API server do not expose Temporal-specific health endpoints — use their existing HTTP health endpoints.

For the Temporal server Deployment, a simple TCP liveness probe on port 7233 is sufficient:

```yaml
livenessProbe:
  tcpSocket:
    port: 7233
  initialDelaySeconds: 30
  periodSeconds: 10
```

---

## Troubleshooting

**Worker fails to connect on startup**

The worker exits immediately if it cannot reach the Temporal server. Check:

- `TEMPORAL_ADDRESS` points to the correct Service name and port
- The Temporal server Deployment is healthy (`oc get pods -l app=temporal`)
- The worker and Temporal server are in the same namespace, or a NetworkPolicy allows cross-namespace traffic

**Temporal server fails with "unknown driver"**

Ensure `DB=postgres12` (not `DB=postgresql`) in the ConfigMap. This is a known issue with `temporalio/auto-setup:1.24`.

**Workflows are scheduled but never executed**

The API server started a workflow but no worker is running. Check:

- `temporal-worker` Deployment is running (`oc get pods -l app=temporal-worker`)
- At least one worker Deployment is polling the queue used by that workflow start call (`TEMPORAL_TASK_QUEUE` in that worker pod env)

**View workflow history**

Use the Temporal UI Route, or port-forward for ad-hoc access:

```bash
oc port-forward svc/temporal-ui 8088:8080
```

Then open http://localhost:8088.

---

## Verifying the deployment

### Check pods are running

```bash
oc get pods -l app=temporal
oc get pods -l app=temporal-worker

# Expected — STATUS should be Running
NAME                               READY   STATUS    RESTARTS
temporal-xxxx                      1/1     Running   0
temporal-worker-xxxx               1/1     Running   0
```

### Check logs

```bash
# Temporal server — should show it is serving with no schema errors
oc logs -l app=temporal --tail=20

# Worker — should show "Worker started, polling for tasks"
oc logs -l app=temporal-worker --tail=20
```

### Verify worker can reach the Temporal server

```bash
oc exec -it deployment/temporal-worker -- \
  node -e "
    const { Connection } = require('@temporalio/client');
    Connection.connect({ address: 'temporal:7233' })
      .then(() => { console.log('Connected OK'); process.exit(0); })
      .catch(e => { console.error('Failed:', e.message); process.exit(1); });
  "
```

### Check via the UI

```bash
# Port-forward the Temporal UI
oc port-forward svc/temporal-ui 8088:8080
```

Open `http://localhost:8088` — you should see the `default` namespace with no errors.

### Quick checklist

| Check             | Command                                                |
| ----------------- | ------------------------------------------------------ |
| Pods running      | `oc get pods -l app=temporal`                          |
| No crash loops    | `oc describe pod -l app=temporal`                      |
| Worker connected  | `oc logs -l app=temporal-worker` → "polling for tasks" |
| DB migrations ran | `oc logs -l app=temporal` → no schema errors           |
| Service reachable | `oc get svc temporal` → port 7233 listed               |
