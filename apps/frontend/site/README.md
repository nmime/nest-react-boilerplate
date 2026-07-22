# site-app

## Ownership

This app owns the SSR site renderer, Vike pages/config, and production server
entrypoint. Shared React DOM UI belongs in `libs/frontend/ui-web`; browser-safe
runtime and API plumbing belong in `libs/frontend/runtime`,
`libs/frontend/api-support`, and `libs/frontend/api-client`.

## Commands

```bash
pnpm exec nx serve site-app
pnpm exec nx build site-app
pnpm exec nx run site-app:preview
pnpm exec nx run site-app:start
pnpm exec nx run site-app:typecheck
pnpm exec nx run site-app:e2e
pnpm run test:storybook
pnpm run frontend:fsd:check
```

`storybook/home.stories.tsx` composes the Vike home page with deterministic
providers. Keep SSR routing, production server behavior, and renderer smoke
coverage in the site build and e2e targets.

## Docs

- [Frontend app rules](../AGENTS.md)
- [Command matrix](../../../docs/command-matrix.md)
- [Frontend SSR framework strategy](../../../docs/frontend-ssr-framework-strategy.md)
- [Frontend deployment topology](../../../docs/frontend-deployment-topology.md)
