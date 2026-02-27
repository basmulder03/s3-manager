# Web E2E Plan

This plan defines the minimum end-to-end coverage required to lock in browser parity for the TypeScript stack.

## Goals

- Validate browser parity flows against running backend APIs.
- Catch regressions in keyboard, context menu, and multi-select behavior.
- Provide CI-visible pass/fail signals for parity-critical user journeys.

## Test Harness

- Runner: Playwright (`@playwright/test`) in `packages/web`.
- Config: `packages/web/playwright.config.ts`.
- Initial smoke suite: `packages/web/e2e/web-smoke.spec.ts`.
- Environment:
  - LocalStack S3 at `http://localhost:4566`
  - Server at `http://localhost:3000`
  - Web app at `http://localhost:5173`
  - `LOCAL_DEV_MODE=true` for deterministic auth bypass in CI parity jobs
- Seed data:
  - Bucket: `my-bucket`
  - Objects:
    - `folder/report.txt`
    - `folder/docs/readme.md`
    - `folder/archive/old.log`

## Core Scenarios

1. Browse + navigation
   - Open `/browser`
   - Navigate into folder
   - Use breadcrumbs to navigate back
2. Create folder
   - Create folder in current path
   - Verify item appears after refresh
3. Rename + move
   - Rename a file
   - Move a file into another prefix
   - Verify destination path and source disappearance
4. Multi-select + bulk delete
   - Select multiple items with checkbox + `Ctrl/Cmd+A`
   - Trigger Delete shortcut
   - Confirm all selected are removed
5. Context menu + keyboard shortcuts
   - Open context menu with right click
   - Validate grouped actions shown
   - Trigger `F2` rename and `Ctrl/Cmd+Shift+M` move
6. Download behavior
   - Trigger file download action
   - Validate presigned URL generation path is hit

## Assertions

- UI state updates are visible (selection count, success/failure messages).
- Data mutations are reflected in browse results.
- Destructive actions require confirmation.
- No uncaught client errors during scenario execution.

## CI Rollout

1. `test:e2e` and `test:e2e:install` scripts are in `packages/web/package.json`.
2. Run E2E suite in a dedicated GitHub Actions job after unit/typecheck.
3. Upload Playwright traces/screenshots for failures.
4. Keep initial suite to smoke scope, then expand by bug history.

## Exit Criteria

- All six core scenarios pass in CI on two consecutive runs.
- Browser parity matrix remains green with latest verification snapshot.
