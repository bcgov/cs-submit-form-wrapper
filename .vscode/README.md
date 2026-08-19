# VSCode Tools

This repo contains some tools to make VSCode development a little easier.

## Launcher

SOBA can be started using the `Run and Debug` item in the Activity Bar. The `launch.json` file defines the launchers:

- `SOBA Backend`: start the SOBA Backend in debug mode
- `SOBA Frontend`: combined frontend on `:3000` with both modes' features (`pnpm dev:combined`)
- `SOBA Frontend (Designer)` / `SOBA Frontend (Forms)`: run a single mode — design-mode on `:3000`, submit-mode on `:3100` (`pnpm dev:designer` / `pnpm dev:forms`)
- `SOBA (Backend + Temporal + Frontend)`: full stack with the combined frontend — the usual default
- `SOBA (Backend + Temporal + Designer + Forms)`: full stack running the two modes as separate instances side by side
- `SOBA (Backend + Temporal)`: backend stack only — run `pnpm --dir frontend dev` (or `soba-fe`) in a terminal for the frontend (see `.devcontainer/README.md` for memory tuning)

To confirm which mode a running frontend is in, type `/{locale}/meta` in the browser (e.g. `http://localhost:3000/en/meta` or `http://localhost:3100/en/meta`). It lists the frontend's feature allowlist and which features are active — handy when comparing the combined instance against the split designer/forms instances.