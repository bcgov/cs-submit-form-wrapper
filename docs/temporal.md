# Temporal.io in SOBA

## What is Temporal?

Temporal is a tool for running background jobs reliably. If a job fails halfway through (e.g. server crash, network error), Temporal automatically retries from where it left off — you don't have to write retry logic yourself.

In SOBA, Temporal handles long-running or multi-step background tasks that should not block an HTTP request.

---

## How it works (the big picture)

There are three things running:

1. **Temporal server** — a Docker container that acts as a job queue and tracks the state of every workflow.
2. **API server** (`dist/app.js`) — your Express app. It submits jobs to the Temporal server when a user does something.
3. **Worker process** (`dist/temporal-worker.js`) — a separate Node.js process that picks up jobs from the Temporal server and actually runs them.

```
User request
    │
    ▼
Express API  ──── start workflow ────▶  Temporal server (Docker :7233)
                                                │
                                                │  assigns task
                                                ▼
                                        Worker process
                                        (runs workflow + activities)


Flow

API Request → Express writes job to Temporal → responds "job queued"
                                    ↓
                         Worker sees the job
                                    ↓
                         Worker does the actual work
                                    ↓
                         Job marked completed

The API server(backend) and the worker are **two separate processes**. Both need to be running for jobs to execute. The app just submits jobs. The worker executes them in the background — even if the app restarts, the job keeps running because Temporal holds the state.
```

## How the worker listens for jobs

The worker does not subscribe or receive push notifications — it **polls** (keeps asking).

```
Worker:  "Any tasks for queue 'soba'?"  →  Temporal: "No"
Worker:  "Any tasks for queue 'soba'?"  →  Temporal: "No"
Worker:  "Any tasks for queue 'soba'?"  →  Temporal: "YES, here's one"
Worker:  executes it, then asks again...
```

This is **long polling** — the worker sends a request over a persistent gRPC connection and Temporal holds it open until a task arrives, then delivers it. No wasted cycles.

The single line that drives this loop is in `src/temporal/worker.ts`:

```typescript
await worker.run(); // blocks forever, polling in a loop
```

The Temporal SDK manages all the polling internally — you never write the loop yourself.

### The glue: task queue name

The worker and the app must use the **same task queue name** — that's how Temporal knows which worker gets which job.

```
App:    client.workflow.start(myWorkflow, { taskQueue: "soba" })
                                                       ↑ must match ↓
Worker: Worker.create({ taskQueue: "soba" })
```

If names don't match, the job sits in the queue forever — no worker picks it up.

---

## Can there be multiple workers?

Yes — in two ways:

### 1. Multiple instances of the same worker (scaling)

Same task queue, multiple processes running in parallel:

```
Worker Process 1  ──┐
Worker Process 2  ──┼──► all polling "soba" queue
Worker Process 3  ──┘
```

Temporal distributes jobs across them automatically. If one crashes, the others keep working.

### 2. Different workers for different task queues (separation of concerns)

```
Worker A  →  polls "email-tasks"   → handles email workflows
Worker B  →  polls "pdf-tasks"     → handles PDF generation
Worker C  →  polls "soba"    → handles general app jobs
```

The app routes jobs to specific queues:

```typescript
client.workflow.start(sendEmail, { taskQueue: "email-tasks" });
client.workflow.start(generatePdf, { taskQueue: "pdf-tasks" });
```

This codebase supports **multiple workers** and **multiple task queues**. The shared default queue is `soba` (`TEMPORAL_TASK_QUEUE`), and individual worker deployments can override `TEMPORAL_TASK_QUEUE` (for example `document-generation`) to isolate workload types.

---

## How the files flow (simple)

There are **3 actors**: your Express API, a Worker process, and the Temporal Server.

Think of it like a job board:

```
Express API          Temporal Server        Worker Process
    |                      |                      |
    |-- posts a job ------->|                      |
    |                      |<-- asks for work -----|
    |                      |-- gives the job ----->|
    |                      |                  does the work
```

**Startup order for the worker:**

```
temporal-worker.ts
  1. Load .env files          (dotenv-init.ts)
  2. Connect to :7233         (NativeConnection.connect)
  3. Register your code       (workflows + activities)
  4. Start polling forever    (worker.run)
```

**Key point:** The worker and API are separate processes. They never talk to each other directly — Temporal Server is the middleman. The worker just sits there waiting, and Temporal tells it when there's work to do.

---

## Files, containers, and how they connect

### The two processes and their files

```
pnpm temporal-worker:dev
  └── temporal-worker.ts        (loads .env via dotenv-init.ts)
        └── src/temporal/worker.ts      (connects to Temporal, starts polling)
              ├── workflows/index.ts    (your workflow functions)
              └── activities/index.ts   (your activity functions)

pnpm dev
  └── dist/app.js               (Express API)
        └── src/temporal/client.ts     (used in routes to start workflows)
```

### How they connect to Docker containers

```
Worker process  -----> temporal (Docker :7233) <----- Express API
                               |
                               v
                        postgres (Docker :5432)
                        database: "temporal" (separate from "soba")

Browser ---------> temporal-ui (Docker :8088)
                        |
                        v
                   temporal (Docker :7233)
```

### Step-by-step: what happens when you run `pnpm temporal-worker:dev`

**Step 1** ( Node.js loads `temporal-worker.ts`)

- This is the entry point, nothing else has run yet

**Step 2** — (`temporal-worker.ts` imports `dotenv-init.ts` first)

- `dotenv-init.ts` reads `backend/.env` then `backend/.env.local`
- Now `process.env` has `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`

**Step 3** — (`temporal-worker.ts` ---> imports `src/temporal/worker.ts` and calls `run()`)

- `worker.ts` reads env vars via `src/core/config/env.ts`

**Step 4** — (`worker.ts` calls --> `NativeConnection.connect("localhost:7233")`)

- Connects to the `temporal` Docker container

**Step 5** —(`worker.ts` calls ---> `Worker.create()`)

- Registers `workflows/index.ts` (bundled separately by Temporal's webpack)
- Registers `activities/index.ts` (imported directly as plain Node.js code)
- Both files are empty barrels until you add real workflow/activity functions

**Step 6** — (`worker.ts` calls ---->`worker.run()`)

- Worker starts polling the `temporal` container for tasks
- Blocks here forever, waiting for work

---

### Step-by-step: what happens when an Express route starts a workflow

**Step 1** — HTTP request hits an Express route in `dist/app.js`

**Step 2** — Route calls `getClient()` from `src/temporal/client.ts`

- First call: opens a connection to `temporal` Docker container `:7233`
- Later calls: reuses the same connection (memoized)

**Step 3** — Route calls `client.workflow.start(myWorkflow, { taskQueue, args })`

- Sends the job to the `temporal` container
- `temporal` stores it in the `temporal` database inside the shared `postgres` container (`:5432`)

**Step 4** — The Worker (running separately) picks up the task from its poll loop

- Runs the matching workflow function from `workflows/index.ts`
- Workflow calls activities via `proxyActivities`
- Activities run from `activities/index.ts` — this is where DB/API calls happen

**Step 5** — Result is stored back in `temporal` container

- Viewable in the UI at `http://localhost:8088`

---

### Which file talks to which container

| File                     | Container        | How                                          |
| ------------------------ | ---------------- | -------------------------------------------- |
| `src/temporal/worker.ts` | `temporal :7233` | `NativeConnection.connect()`                 |
| `src/temporal/client.ts` | `temporal :7233` | `Connection.connect()`                       |
| `temporal-ui` container  | `temporal :7233` | internal Docker network                      |
| `temporal` container     | `postgres :5432` | internal Docker network (uses `temporal` db) |

---

## Key concepts

| Term | Explanation
| **Workflow** | The overall job — defines the steps and their order. Must be deterministic (no I/O, no randomness). |
| **Activity** | A single step inside a workflow — this is where real work happens (DB queries, API calls, emails, etc.). |
| **Task queue** | The named channel a worker process listens on. For a given workflow start call, its taskQueue value must match at least one running worker. |
| **Worker** | The process that listens to a task queue and executes workflows and activities. |

---

## Files added for Temporal

The repo has one worker entry point (`temporal-worker.ts`), but you can run that same entry point as many times as needed with different environment values. Each process instance can poll a different queue.

```
backend/
├── dotenv-init.ts                        # Loads .env before anything else (worker only)
├── temporal-worker.ts                    # Entry point for the worker process
└── src/temporal/
    ├── worker.ts                         # Connects to Temporal and starts polling
    ├── client.ts                         # Shared client used by Express routes to start workflows
    ├── workflows/
    │   └── index.ts                      # Export all workflow functions from here
    └── activities/
        └── index.ts                      # Export all activity functions from here

.devcontainer/
├── docker-compose.yml                    # Adds temporal, temporal-ui (uses existing postgres)
└── config/
    └── temporal-dynamicconfig.yaml       # Temporal server settings (e.g. ID length limit)
```

---

## Docker services

Two services were added to `.devcontainer/docker-compose.yml`:

| Service       | Image                      | Port | Purpose                     |
| ------------- | -------------------------- | ---- | --------------------------- |
| `temporal`    | temporalio/auto-setup:1.24 | 7233 | The Temporal server itself  |
| `temporal-ui` | temporalio/ui:2.48.0       | 8088 | Web UI to monitor workflows |

**SDK and server versions:** Temporal documents that [all SDK versions support all server versions](https://docs.temporal.io/docs/server/versions-and-dependencies); SOBA still bumps the TypeScript SDK (`@temporalio/*`) on a regular cadence alongside the dev server image (`temporalio/auto-setup:1.24`).

Temporal uses the **same `postgres` service** as the app (port 5432) but stores its state in a **separate database** named `temporal` (auto-created on first startup). The app uses the `soba` database. Both live in the same PostgreSQL instance — they do not interfere with each other.

One important setting in the `temporal` service config:

```yaml
DB: postgres12 # correct driver for temporalio/auto-setup:1.24
```

The dynamic config file is mounted from your local `.devcontainer/config/` folder into the container:

```yaml
volumes:
  - ./config:/etc/temporal/config/dynamicconfig
```

This means changes to `.devcontainer/config/temporal-dynamicconfig.yaml` take effect after a container restart — no image rebuild needed.

---

## Environment variables

Set in `backend/.env` (and `.env.example`). Read via `env.getTemporal*()` helpers in `src/core/config/env.ts`.

| Variable                      | Default          | What it does                                                                                                                                                             |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TEMPORAL_ALLOWED`            | `false`          | When `true`, worker connects and `getClient()` works; when `false`, worker exits without connecting and `getClient()` rejects. `.env.example` ships `true` for local dev |
| `TEMPORAL_ADDRESS`            | `localhost:7233` | Where the Temporal server is listening                                                                                                                                   |
| `TEMPORAL_NAMESPACE`          | `default`        | Logical namespace for isolating workflows                                                                                                                                |
| `TEMPORAL_TASK_QUEUE`         | `soba`           | Default queue name — each worker can override this via env                                                                                                               |
| `TEMPORAL_WORKER_HEALTH_PORT` | `9090`           | Worker HTTP health port (`/readyz`, `/healthz`); each worker process must use a unique port                                                                              |

---

## How the worker loads environment variables

The worker is a standalone Node process — it does not share startup code with the Express app. To make sure `.env` is loaded before any other module runs, `temporal-worker.ts` imports `dotenv-init` as its very first line:

```typescript
// temporal-worker.ts
import "./dotenv-init"; // <-- must be first, loads .env and .env.local
import { run } from "./src/temporal/worker";
```

`dotenv-init.ts` is a plain file that calls `dotenv.config()` twice (base `.env`, then `.env.local` for local overrides). Putting it first guarantees `process.env` is populated before the rest of the app code is required.

---

## Running locally

Local dev uses the **same `postgres` service** as the rest of the stack (there is no separate `temporal-db` service); Temporal creates and uses its own database on that instance.

**Step 1 — Start the Docker services** (from repo root, inside devcontainer):

```bash
docker compose -f .devcontainer/docker-compose.yml up -d postgres temporal temporal-ui
```

**Step 2 — Start workers**

Recommended (VS Code): run the compound debug config `SOBA (Backend + Temporal + Frontend)` or `SOBA (Backend + Temporal)`. These compounds start both known worker queues automatically using `.vscode/launch.json`:

- `SOBA Temporal Worker (soba)`
- `SOBA Temporal Worker (document-generation)`

Manual fallback (from `backend/`):

```bash
# terminal A
TEMPORAL_TASK_QUEUE=soba TEMPORAL_WORKER_HEALTH_PORT=9090 pnpm temporal-worker:dev

# terminal B
TEMPORAL_TASK_QUEUE=document-generation TEMPORAL_WORKER_HEALTH_PORT=9091 pnpm temporal-worker:dev
```

One-shot (no watch): `pnpm temporal-worker`. After `pnpm run build`: `pnpm temporal-worker:start` runs `node dist/temporal-worker.js` (same as OpenShift worker command).

Important:

- `.env` sets defaults; it does not create worker processes.
- One process polls one queue value.
- A second queue needs a second worker process.
- The VS Code compounds automate this by launching multiple worker processes with queue-specific env overrides.
- Health ports must be unique per process (for example 9090 and 9091).

**Step 3 — Open the UI** to see running/completed/failed workflows:
http://localhost:8088 (auto-forwarded by devcontainer)

**Step 4 — Start the API server as usual** (from `backend/`):

```bash
pnpm dev
```

> The API server and at least one matching worker must be running at the same time for workflows to execute end-to-end.

---

## Adding a new feature

### Step 1 — Write the activity

An activity is just an `async` function. Put real work here: database calls, sending emails, calling external APIs, etc.

Create a file in `backend/src/temporal/activities/`:

```typescript
// backend/src/temporal/activities/sendNotification.ts
import { log } from "@temporalio/activity";

export async function sendNotification(
  userId: string,
  message: string,
): Promise<void> {
  log.info("Sending notification", { userId });
  // do the real work here — DB, email, HTTP, etc.
}
```

Then export it from the barrel file so the worker can find it:

```typescript
// backend/src/temporal/activities/index.ts
export { sendNotification } from "./sendNotification";
```

### Step 2 — Write the workflow

A workflow defines the sequence of steps. It calls activities but **cannot do any I/O itself** — no database, no HTTP, no `Date.now()`, no `Math.random()`. All of that must go in activities.

Create a file in `backend/src/temporal/workflows/`:

```typescript
// backend/src/temporal/workflows/notifyUser.ts
import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities";

// Always access activities through proxyActivities — never import them directly
const { sendNotification } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds", // how long an activity can run before timing out
});

export async function notifyUserWorkflow(
  userId: string,
  message: string,
): Promise<void> {
  await sendNotification(userId, message);
}
```

Then export it from the barrel file:

```typescript
// backend/src/temporal/workflows/index.ts
export { notifyUserWorkflow } from "./notifyUser";
```

### Step 3 — Trigger the workflow from an Express route

Use `getClient()` to get the shared Temporal client and call `workflow.start()`:

```typescript
import { getClient } from "../temporal/client";
import { env } from "../core/config/env";

router.post("/notify/:userId", async (req, res) => {
  const client = await getClient();

  await client.workflow.start("notifyUserWorkflow", {
    taskQueue: env.getTemporalTaskQueue(), // must match the worker's queue
    workflowId: `notify-${req.params.userId}-${Date.now()}`, // must be unique
    args: [req.params.userId, req.body.message],
  });

  res.json({ status: "queued" });
});
```

`workflowId` identifies this specific run. Use a pattern like `<feature>-<entity-id>-<timestamp>` so it is unique and easy to find in the UI.

### Step 4 (optional) — Interact with a running workflow

If you need to send new data to a workflow while it is still running (signal), or read its current state (query):

```typescript
const handle = client.workflow.getHandle("notify-user-abc-123");

// Signal: push new input into the workflow
await handle.signal("cancelSignal");

// Query: read state without stopping the workflow
const status = await handle.query("statusQuery");
```

Signals and queries must be defined inside the workflow using `defineSignal` / `defineQuery` from `@temporalio/workflow`.

---

## Testing

**Activities** are plain async functions — test them with Jest like any other function, mocking DB/service dependencies as needed.

**Workflows** use `@temporalio/testing` to spin up a lightweight in-process Temporal environment (no Docker required in CI):

```typescript
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { notifyUserWorkflow } from "../src/temporal/workflows/notifyUser";
import * as activities from "../src/temporal/activities";

let testEnv: TestWorkflowEnvironment;

beforeAll(async () => {
  testEnv = await TestWorkflowEnvironment.createLocal();
});

afterAll(async () => {
  await testEnv.teardown();
});

it("sends a notification", async () => {
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    taskQueue: "test",
    workflowsPath: require.resolve("../src/temporal/workflows"),
    activities,
  });

  await worker.runUntil(
    testEnv.client.workflow.execute(notifyUserWorkflow, {
      taskQueue: "test",
      workflowId: "test-notify-1",
      args: ["user-1", "hello"],
    }),
  );
});
```

---

## Checklist for a new Temporal feature

- [ ] Activity file created under `src/temporal/activities/`
- [ ] Activity exported from `src/temporal/activities/index.ts`
- [ ] Workflow file created under `src/temporal/workflows/`
- [ ] Workflow exported from `src/temporal/workflows/index.ts`
- [ ] Workflow file does NOT import Node.js built-ins or do any I/O directly
- [ ] Express route uses `getClient()` and passes the correct `taskQueue`
- [ ] `workflowId` is unique per logical run
- [ ] Activity and workflow unit tests added
