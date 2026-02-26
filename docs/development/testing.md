# Testing Guide (TypeScript)

All tests in this repository are TypeScript-based.

## Test Suites

- Server tests (Bun): `packages/server/src/**/*.test.ts`
- Web unit tests (Vitest): `packages/web/src/**/*.test.tsx`
- Web E2E smoke (Playwright): `packages/web/e2e/**/*.spec.ts`

## Run Locally

From repository root:

```bash
bun run typecheck
bun run test:server
bun run test:web
```

Playwright smoke tests:

```bash
bun run --filter web test:e2e:install
bun run test:e2e:web
```

## E2E Dependencies

Playwright smoke tests expect:
- API at `http://127.0.0.1:3000`
- Web at `http://127.0.0.1:5173`
- LocalStack S3 at `http://127.0.0.1:4566`

You can either run server/web manually, or use `E2E_MANAGED_SERVERS=true` so Playwright starts them.

## CI

See `docs/development/ci.md` and `.github/workflows/typescript-ci.yml`.
