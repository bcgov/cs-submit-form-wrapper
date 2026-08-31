This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment

The frontend uses `.env` for backend discovery and runtime bootstrap. It is not committed; it is created from `.env.example` when the devcontainer starts.

**`.env.example`** values are for the **localhost / local dev** environment:

- `NEXT_PUBLIC_SOBA_API_BASE_URL` — SOBA backend API base URL (e.g. `http://localhost:4000/api/v1`)
- `NEXT_PUBLIC_SOBA_FEATURES_ALLOWED` — comma-separated feature codes from `GET /meta/features` (e.g. `workspaces`, `design-mode`, `submit-mode`, `meta`, `marketing`), or **`*`** / **`all`** to allow every platform-allowed feature. The `meta` code enables the dev-oriented **feature-support** page (`/{locale}/meta`) — type it in the browser (not in any nav) to see this frontend's allowlist and which features are active. **Empty/unset:** no feature codes allowed at the frontend layer (plugins with a `featureCode` stay off). Typical local dev: `*`.

At runtime, frontend auth configuration (Keycloak URL/realm/clientId) is loaded from backend `GET /api/v1/meta/frontend-config` based on backend IdP config. Feature rows load from `GET /meta/features` for SSR (nav/home plugins).

**How it is created**

- In the devcontainer: `frontend/.env` is created from `frontend/.env.example` if it doesn't exist, and refreshed on each container start.
- Outside the devcontainer: `cp frontend/.env.example frontend/.env` and edit as needed.

**How it is applied**

- Next.js loads `.env` automatically at build and runtime. No extra setup required.

## Getting Started

First, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Hangs when compiling

If the next server is hanging in compiling / or some other route the fix is often to force a rebuild (stop server, rm -rf .next, restart server)
