# Stage 5 Parity Matrix

This matrix tracks parity between legacy browser behavior and the new TypeScript frontend.

## Scope

- Frontend route: `/browser`
- Backend API: `s3.*` tRPC procedures
- Focus: file operations, selection semantics, and keyboard/context interactions

## Current Status

| Area | Legacy Behavior | New Frontend | Status |
| --- | --- | --- | --- |
| Browse navigation | Breadcrumb + folder drill-down | Breadcrumb + folder drill-down | Complete |
| Create folder | Modal + API call | Inline folder input + `s3.createFolder` | Complete |
| Download file | Per-item download action | Per-item + bulk download via metadata URL | Complete |
| Delete file/folder | Confirm + operation API | Per-item + bulk delete with confirms | Complete |
| Rename item | Prompt/modal rename | Rename via `s3.renameItem` | Complete |
| Move item | Path-based move | Move via `s3.renameItem(destinationPath)` | Complete |
| Multi-select | Checkbox + Ctrl/Cmd + Shift range | Checkbox + Ctrl/Cmd + Shift range | Complete |
| Keyboard shortcuts | Delete, select-all style behavior | `Ctrl/Cmd+A`, `Delete`, `Esc`, `Ctrl/Cmd+D`, `F2`, `Ctrl/Cmd+Shift+M` | Complete |
| Context menu | Right-click item actions | Right-click grouped action menu | Complete |
| Rename/move edge cases | Bucket boundary + invalid names | Bucket-boundary guard + path/name validation | Complete |

## Remaining Gap Candidates

- Context-menu focus/ARIA pass for accessibility hardening
- End-to-end parity suite against LocalStack + OIDC provider in CI
- Deep legacy UX nuances (exact timing/ordering of multi-download start)

## Verification Commands

```bash
bun run --filter web typecheck
bun run --filter web test
bun run --filter server typecheck
bun run --filter server test
bun run build
```

## Dedicated Parity Tests

- `packages/web/src/BrowserParity.test.tsx`
  - Select-all + Delete keyboard flow
  - Right-click context menu grouping and actions
