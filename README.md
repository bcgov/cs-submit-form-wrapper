# SOBA

Soba is a web-based application designed for creating web forms and managing collected data. It is a free service available to all B.C. government employees and contractors with an IDIR account.

## Prerequisites

You need a Docker-compatible runtime:

- Colima
- Rancher Desktop
- Docker Desktop

As long as the command `docker ps` works, VS Code Dev Containers will run correctly.

---

## Quick Start (Recommended)

### 1. VS Code Dev Containers

1. Install [VS Code](https://code.visualstudio.com/) and the  
   [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Open the project folder in VS Code
3. Click the green remote indicator in the bottom-left corner and select  
   **“Reopen in Container”**
4. Wait for the devcontainer to build and start
5. Start the services using VS Code launch configurations:
   - **SOBA Backend**
   - **SOBA Frontend**
   - Or the combined **SOBA (Backend + Frontend)** compound

### Service URLs

- **Backend**: http://localhost:4000
- **Frontend**: http://localhost:5173

---

## Development

### Backend

Runs on **port 4000** with hot reload:

```
npm run dev --prefix backend
```

Or use the VS Code launch configuration **SOBA Backend**.

### Frontend

Runs on **port 5173** using Vite:

```
npm run dev --prefix frontend -- --host
```

Or use the VS Code launch configuration **SOBA Frontend**.

### MongoDB (Optional)

If enabled in `.devcontainer/docker-compose.yml`, MongoDB runs as a sidecar container and is available at:

```
mongodb://mongodb:27017
```

---

## Project Structure

- `backend/` — Express.js API server
- `frontend/` — React + Vite application
- `.devcontainer/` — Devcontainer configuration
- `.vscode/` — Launch configurations for backend and frontend

---

## Troubleshooting

### Docker connection issues

Ensure your Docker runtime is running:

```
docker ps
```

### Port conflicts

If ports 4000 or 5173 are in use, update the forwarded ports in `.devcontainer/devcontainer.json`.

### Container won’t start

Check logs:

```
docker compose -f .devcontainer/docker-compose.yml logs
```

### Slow file sync

Some Docker runtimes have slower file sharing.
Check your runtime’s file sharing settings.
