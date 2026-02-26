# S3 Manager (TypeScript)

S3 Manager is a Bun + TypeScript application with:
- backend API in `packages/server` (Hono + tRPC)
- frontend app in `packages/web` (React + Vite)
- optional local infra via LocalStack and Keycloak

## Quick Start

1) Install dependencies:

```bash
bun install
```

2) Start infra (LocalStack + Keycloak):

```bash
docker compose -f docker-compose.local-dev.yml up -d
```

3) Run backend and frontend:

```bash
bun run dev:server
bun run dev:web
```

- API: `http://localhost:3000`
- Web: `http://localhost:5173`

## Commands

```bash
bun run typecheck
bun run test:server
bun run test:web
bun run test:e2e:web
bun run build
```

## Structure

```text
packages/
  server/   # Hono + tRPC backend
  web/      # React frontend
docs/       # development docs
```

## CI

- TypeScript CI workflow: `.github/workflows/typescript-ci.yml`
- Current rollout mode is manual dispatch.
