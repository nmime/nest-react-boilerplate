# landing-app

Path: `apps/frontend/landing`
Nx project: `landing-app`
Package: `landing-app`
Runtime: Astro + React islands
Local URL: `http://localhost:4202`

## Ownership

This app owns the public landing renderer, Astro config, content shell, and
app-local smoke tests. Shared React DOM UI belongs in `libs/frontend/ui-web`.
Do not put authenticated user flows or backend-only code in this app.

## Commands

```bash
pnpm exec nx serve landing-app
pnpm exec nx build landing-app
pnpm exec nx run landing-app:preview
pnpm exec nx run landing-app:test
pnpm exec nx run landing-app:e2e
pnpm run frontend:fsd:check
```

## Docs

- [Frontend app rules](../AGENTS.md)
- [Command matrix](../../../docs/command-matrix.md)
- [Frontend deployment topology](../../../docs/frontend-deployment-topology.md)
- [Frontend UX](../../../docs/frontend-ux.md)
