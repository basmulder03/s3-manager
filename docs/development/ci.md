# CI Guide (TypeScript)

This project uses a TypeScript-first CI workflow at `.github/workflows/typescript-ci.yml`.

The workflow is currently manual-only (`workflow_dispatch`) while the migration cutover is still in progress.

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

## Legacy Workflow

The legacy Python workflow is kept as manual-only for transition support:

- `.github/workflows/test.yml`
- Workflow name: `Legacy Python Tests (Manual)`

Use it only when validating legacy Flask paths during cutover.
