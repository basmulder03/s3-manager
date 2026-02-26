# CI Guide (TypeScript)

This project uses a TypeScript-first CI workflow at `.github/workflows/typescript-ci.yml`.

The workflow is manual-only (`workflow_dispatch`).

## Workflow Jobs

- `Typecheck + Unit Tests`
  - Runs `bun run typecheck`
  - Runs server and web unit tests
- `Build`
  - Runs `bun run build`
- `Web E2E Smoke`
  - Starts LocalStack service
  - Runs Playwright smoke tests from `packages/web/e2e`

`Build` and `Web E2E Smoke` are optional on manual dispatch and only run when selected.

## Recommended Branch Protection Checks

When this workflow is later enabled for automatic PR/push runs, require these status checks on `main`:

- `Typecheck + Unit Tests`
- `Build`
- `Web E2E Smoke`

Only TypeScript CI workflows are used.
