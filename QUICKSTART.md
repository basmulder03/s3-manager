# Quick Reference - TypeScript S3 Manager

## Running the Server

```bash
# From project root
cd packages/server
bun run dev

# Or with custom port
PORT=3001 bun run dev
```

## Running the Frontend

```bash
# From project root
cd packages/web
bun run dev

# Open
http://localhost:5173
```

The frontend talks to `VITE_API_URL` (defaults to `http://localhost:3000/trpc`).

Frontend includes:

- Auth controls in UI (login, logout, automatic session renewal with hidden manual fallback)
- S3 browser navigation with breadcrumbs
- File upload panel using typed upload cookbook (direct vs multipart)
- Browser operations: create folder, download file, delete file/folder
- Frontend routes: `/overview`, `/browser`, `/upload`

## Test Endpoints

```bash
# Health check (simple)
curl http://localhost:3000/health

# Readiness check (with dependencies)
curl http://localhost:3000/health/ready

# Server info
curl http://localhost:3000/trpc/health.info

# OpenAPI JSON (auto-generated)
curl http://localhost:3000/openapi.json

# API reference UI (Scalar)
# Open in browser: http://localhost:3000/docs

# Auth status
curl http://localhost:3000/trpc/auth.status

# Current authenticated user
curl http://localhost:3000/trpc/auth.me \
  -H 'Authorization: Bearer <access-token>'

# Introspect current token if provider supports it
curl http://localhost:3000/trpc/auth.introspect \
  -H 'Authorization: Bearer <access-token>'

# OIDC login start
curl -i http://localhost:3000/auth/login

# Current HTTP auth user from cookie/header
curl -i http://localhost:3000/auth/user

# Refresh tokens using refresh cookie
curl -i -X POST http://localhost:3000/auth/refresh

# Logout (revokes access/refresh tokens when revocation endpoint is available)
curl -i http://localhost:3000/auth/logout

# S3 buckets
curl http://localhost:3000/trpc/s3.listBuckets

# S3 virtual filesystem root
curl "http://localhost:3000/trpc/s3.browse?input=%7B%22virtualPath%22%3A%22%22%7D"

# S3 create presigned upload URL
curl -X POST http://localhost:3000/trpc/s3.createPresignedUpload \
  -H 'content-type: application/json' \
  -d '{"json":{"bucketName":"my-bucket","objectKey":"folder/file.txt","contentType":"text/plain"}}'

# S3 upload cookbook contract (single + multipart)
curl "http://localhost:3000/trpc/s3.uploadCookbook?input=%7B%22bucketName%22%3A%22my-bucket%22%2C%22objectKey%22%3A%22folder%2Fvideo.mp4%22%2C%22fileSizeBytes%22%3A52428800%7D"

# Root endpoint
curl http://localhost:3000/
```

## File Structure

```
packages/server/src/
├── config/index.ts    # Environment config with Zod validation
├── telemetry/          # Logging, traces, and metrics
├── services/s3/        # S3 service layer (AWS SDK + helpers)
├── trpc/
│   ├── index.ts       # tRPC initialization & context
│   └── router.ts      # Main router (combines feature routers)
├── routers/
│   ├── health.ts      # Health check endpoints
│   └── s3.ts          # S3 tRPC procedures
├── app.ts             # Hono app setup (middleware, CORS, etc.)
└── index.ts           # Entry point (loads env, starts server)

packages/web/src/
├── App.tsx            # Frontend shell (health/auth/s3)
├── trpc/client.ts     # Typed tRPC client
├── state/ui.ts        # Zustand UI state
├── components/        # Reusable UI components
└── styles.css         # Visual theme
```

## Common Commands

```bash
# Install dependencies
bun install

# Development (hot reload)
bun run dev

# Build for production
bun run build

# Frontend tests
bun run test:web

# Frontend E2E smoke tests
bun run test:e2e:web

# Run production build
bun run start

# Type checking
bun run typecheck

# Linting
bun run lint

# Format code
bun run format
```

## Environment Variables

Edit `.env.local` in the project root:

```bash
# Required
SECRET_KEY=dev-secret-key-change-in-production
S3_SOURCE_0_ID=localstack
S3_SOURCE_0_ENDPOINT=http://localhost:4566
S3_SOURCE_0_ACCESS_KEY=test
S3_SOURCE_0_SECRET_KEY=test

# Optional (defaults shown)
PORT=3000
NODE_ENV=development
WEB_ORIGIN=http://localhost:5173
VITE_API_URL=http://localhost:3000/trpc
LOCAL_DEV_MODE=false
OIDC_PROVIDER=keycloak
S3_SOURCE_0_REGION=us-east-1
S3_SOURCE_0_USE_SSL=false
S3_SOURCE_0_VERIFY_SSL=false

# Telemetry
OTEL_ENABLED=true
OTEL_LOG_FORMAT=pretty
OTEL_EXPORTER_TYPE=console

# Auth
AUTH_REQUIRED=true
AUTH_ROLES_CLAIM=roles
AUTH_ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS=3600
AUTH_REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS=2592000
AUTH_REVOKE_ON_LOGOUT=true
```

Production auth/cookie baseline:

- `AUTH_REQUIRED=true`
- `SESSION_COOKIE_SECURE=true`
- If cross-site cookies are required: `SESSION_COOKIE_SAME_SITE=None` and keep secure=true
- Keep token lifetimes explicit with `AUTH_ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS` and `AUTH_REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS`

Permission behavior for tRPC routes:

- `AUTH_REQUIRED=true` is required for non-test runtime.
- Bearer access tokens are verified against OIDC JWKS when present.
- `LOCAL_DEV_MODE` is only allowed when `NODE_ENV=test`.

Frontend upload helper:

- Web-ready core: `packages/server/src/shared/upload/client.ts`
- Shared contracts: `packages/server/src/shared/upload/contracts.ts`
- Optional tRPC adapter: `packages/server/src/shared/upload/trpc-adapter.ts`
- Backward-compatible export: `packages/server/src/services/s3/upload-client-helper.ts`
- Function: `uploadObjectWithCookbook(...)`
- Chooses direct or multipart strategy automatically using `s3.uploadCookbook`

## Adding a New tRPC Router

1. Create router file:

```typescript
// src/routers/my-feature.ts
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';

export const myFeatureRouter = router({
  getData: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    return { data: `Hello ${input.id}` };
  }),
});
```

2. Add to main router:

```typescript
// src/trpc/router.ts
import { myFeatureRouter } from '../routers/my-feature';

export const appRouter = router({
  health: healthRouter,
  myFeature: myFeatureRouter, // Add here
});
```

3. TypeScript automatically syncs types!

## Code Style

- **Strict TypeScript** - No `any` types allowed
- **Functional** - Prefer pure functions
- **Modular** - Files should be <250 lines
- **Descriptive** - Clear variable/function names
- **Documented** - JSDoc for public APIs

## Troubleshooting

**Server won't start:**

- Check `.env.local` exists
- Verify `S3_SOURCE_0_ENDPOINT` is a valid URL
- Look for validation errors in console

**Env vars not loading:**

- File must be in project ROOT (not packages/server/)
- Check file name (`.env.local` not `env.local`)

**Type errors:**

```bash
# Check what's wrong
bun run typecheck

# Auto-fix linting
bun run lint --fix
```

## Next Steps

See docs for:

- Detailed architecture explanation
- Testing and CI workflows
- Deployment guidance

Current focus includes CI/CD readiness with `.github/workflows/typescript-ci.yml`.
Branch protection recommendations are documented in `docs/development/ci.md`.

## Quick Wins

Current TypeScript version:

- ✅ Strong type safety across server and web
- ✅ Config validated at startup
- ✅ Fast local hot reload
- ✅ Modular code structure
- ✅ Auto-synced API types

## Links

- [Bun](https://bun.sh)
- [tRPC](https://trpc.io)
- [Zod](https://zod.dev)
- [Hono](https://hono.dev)
