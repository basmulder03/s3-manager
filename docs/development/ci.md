# CI Guide (TypeScript)

This project uses a TypeScript-first CI workflow at `.github/workflows/typescript-ci.yml`.

The workflow is manual-only (`workflow_dispatch`).

## Manual Dispatch Inputs

- `preset`:
  - `quick` (default): run only jobs relevant to changed files
  - `full`: run full CI scope (`Typecheck + Unit Tests`, `Build`, `Web E2E Smoke`)
- `base_ref`: branch used for changed-file comparison (default: `main`)
- `run_build`: include `Build` when using `quick`
- `run_e2e`: include `Web E2E Smoke` when using `quick`

In `quick` mode, jobs are skipped when changes do not affect their scope.

## Workflow Jobs

- `Typecheck + Unit Tests`
  - Runs `bun run typecheck`
  - Runs server and web unit tests
- `Build`
  - Runs `bun run build`
- `Web E2E Smoke`
  - Starts LocalStack service
  - Runs Playwright smoke tests from `packages/web/e2e`

`Build` and `Web E2E Smoke` are optional in `quick` mode and only run when selected.

## Recommended Branch Protection Checks

When this workflow is later enabled for automatic PR/push runs, require these status checks on `main`:

- `Typecheck + Unit Tests`
- `Build`
- `Web E2E Smoke`

Only TypeScript CI workflows are used.
