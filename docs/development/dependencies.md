# Dependencies (TypeScript)

The project uses Bun workspaces with two packages:

- `packages/server`
- `packages/web`

Install/update dependencies from repository root:

```bash
bun install
```

## Key Runtime Dependencies

- Backend: `hono`, `@trpc/server`, `zod`, `jose`, `@aws-sdk/client-s3`
- Frontend: `react`, `react-router-dom`, `@trpc/react-query`, `@tanstack/react-query`, `zustand`

## Key Dev Dependencies

- TypeScript, ESLint, Prettier
- Vitest + Testing Library
- Playwright for E2E smoke tests

Dependencies are managed only through Bun workspaces.
