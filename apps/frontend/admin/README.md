# admin-app

## Ownership

This app owns admin route shell, bootstrapping, and app-local Vite/test config.
Shared web UI belongs in `libs/frontend/ui-web`, frontend runtime helpers in
`libs/frontend/runtime`, and API wrappers in `libs/frontend/api-client` or
`libs/frontend/api-support`.

The `/admin/settings/errors` route is the tenant-scoped error-presentation
catalog. `admin:settings:read` can inspect and preview OpenAPI-generated response
rules by service, endpoint, method, HTTP status, `ERR`, or `NET` variant.
`admin:settings:update` can override toast/silent display, severity, and optional
EN/RU copy with optimistic revision checks. Updates and resets are written to
the admin audit log.

## Commands

```bash
pnpm exec nx serve admin-app
pnpm exec nx build admin-app
pnpm exec nx run admin-app:test
pnpm exec nx run admin-app:e2e
pnpm run test:storybook
pnpm run frontend:fsd:check
```

`storybook/dashboard.stories.tsx` composes the static dashboard and RBAC-aware
shell with deterministic providers. Keep routing, session/API behavior, and
complete admin flows in `admin-app:e2e`.

## Docs

- [Frontend app rules](../AGENTS.md)
- [Command matrix](../../../docs/command-matrix.md)
- [Frontend FSD](../../../docs/frontend-fsd.md)
- [Frontend state](../../../docs/frontend-state.md)
