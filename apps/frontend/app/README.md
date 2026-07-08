# user-app

Path: `apps/frontend/app`
Nx project: `user-app`
Package: `user-app`
Runtime: React + Vite user SPA
Local URL: `http://localhost:4201`

## Ownership

This app owns the current authenticated user SPA shell. Keep reusable user
features, API wrappers, runtime helpers, and shared UI in `libs/frontend/**`.
`site-app` is the Vike SSR surface; do not retire or replace `user-app` without
explicit parity work.

## Commands

```bash
pnpm exec nx serve user-app
pnpm exec nx build user-app
pnpm exec nx run user-app:test
pnpm exec nx run user-app:e2e
pnpm run frontend:fsd:check
```

## Docs

- [Frontend app rules](../AGENTS.md)
- [Command matrix](../../../docs/command-matrix.md)
- [Frontend FSD](../../../docs/frontend-fsd.md)
- [Frontend state](../../../docs/frontend-state.md)
