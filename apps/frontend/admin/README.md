# admin-app

## Ownership

This app owns admin route shell, bootstrapping, and app-local Vite/test config.
Shared web UI belongs in `libs/frontend/ui-web`, frontend runtime helpers in
`libs/frontend/runtime`, and API wrappers in `libs/frontend/api-client` or
`libs/frontend/api-support`.

## Commands

```bash
pnpm exec nx serve admin-app
pnpm exec nx build admin-app
pnpm exec nx run admin-app:test
pnpm exec nx run admin-app:e2e
pnpm run frontend:fsd:check
```

## Docs

- [Frontend app rules](../AGENTS.md)
- [Command matrix](../../../docs/command-matrix.md)
- [Frontend FSD](../../../docs/frontend-fsd.md)
- [Frontend state](../../../docs/frontend-state.md)
