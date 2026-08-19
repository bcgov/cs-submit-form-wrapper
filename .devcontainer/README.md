# SOBA Dev Container

A Node 24 workspace container plus sidecar services (Postgres, MongoDB, Form.io, Temporal).
Open the repo in VS Code and **Reopen in Container**.

## Layout

- `Dockerfile` — the workspace image: node, pnpm, `psql`, `mongosh`, `oc`, `k6`, `jq`; features for docker-in-docker, GitHub CLI, kubectl/Helm.
- `docker-compose.devcontainer.yml` — the workspace container (`app`) the dev container runs in.
- `docker-compose.yml` — the sidecars. Started separately, reached over `host.docker.internal`.
- `.env` — optional, gitignored, per-developer resource caps (see below).
- `post-create.sh` / `post-start.sh` — pnpm setup and env-file sync.

## First run

The container builds and runs `pnpm install`. Then bring up the sidecars and init the DB:

```bash
pnpm dev:services:up   # Postgres, Mongo, Form.io, Temporal
pnpm db:init           # migrate + seed
```

Run the app from the repo root (or use the VS Code launch configs):

```bash
pnpm --dir backend dev
pnpm --dir frontend dev   # in another terminal
```

Ports are forwarded to your host, so open these in your host browser:

| App      | URL                                                       |
| -------- | --------------------------------------------------------- |
| Frontend | http://localhost:3000                                     |
| Backend  | http://localhost:4000                                     |
| Form.io  | http://localhost:3001 (`formio@localhost.com` / `formio`) |

## Sidecar connection strings

Reach the sidecars over `host.docker.internal` — the `app` service sets `extra_hosts: host.docker.internal:host-gateway`, so this works on Linux as well as Docker Desktop:

| Service  | Connection                                                          |
| -------- | ------------------------------------------------------------------- |
| Postgres | `postgresql://postgres:postgres@host.docker.internal:5432/postgres` |
| MongoDB  | `mongodb://host.docker.internal:27017`                              |
| Form.io  | `http://host.docker.internal:3001`                                  |

## Per-developer resource limits

The `app` container is **uncapped by default**. To bound its memory/swap or the Node heap, copy the example and edit:

```bash
cp .devcontainer/.env.example .devcontainer/.env
```

```bash
DEVCONTAINER_MEMORY=4g              # RAM cap
DEVCONTAINER_MEMORY_SWAP=8g         # memory + swap TOTAL, not swap alone
DEVCONTAINER_NODE_OPTIONS=--max-old-space-size=4096
```

Rebuild the container to apply. Notes:

- `DEVCONTAINER_MEMORY_SWAP` is memory **plus** swap combined. Set it equal to `DEVCONTAINER_MEMORY` to disable swap; higher allows that much swap on top.
- `NODE_OPTIONS` caps the V8 heap **per process** (Next dev, Jest, and tsserver each get their own) — it can't be derived from the memory cap, so keep it sensible by hand. The frontend `pnpm dev*` scripts honor this value (they fall back to `--max-old-space-size=8192` only when it's unset), so `DEVCONTAINER_NODE_OPTIONS` tunes them too.
- `.env` is gitignored; with no file, or all lines commented, the container runs uncapped.

Heap out of memory during a build → raise `--max-old-space-size`. Tests killed with `SIGKILL` → you're over total RAM; lower the heaps or run backend tests serially (`pnpm --dir backend test`).

The cap above sizes the whole container; to tune individual processes under it there are optional shell aliases (`soba-fe`, `soba-test-be`) that set per-task heap and worker counts: `cp .devcontainer/bashrc.example ~/.bashrc && source ~/.bashrc` (re-copy after a rebuild).

## Env files (backend / frontend)

Separate from the devcontainer `.env` above. `post-start.sh` keeps `backend/.env`, `backend/.env.local`, and `frontend/.env` in step with their `*.example` templates: it creates them if missing and, when a template changes, backs up the current file to `*.prev` before applying the new one. Put secrets in `backend/.env.local` and re-apply them from the backup after a template bump. The app loads these itself (dotenv / Next.js); they are not injected into the container.
