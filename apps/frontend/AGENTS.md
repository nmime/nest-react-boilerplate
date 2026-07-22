# Frontend App Instructions

Follow the root [AGENTS.md](../../AGENTS.md) and detailed
[AI agent policy](../../docs/ai/agent-policy.md) first. This file adds rules for
`apps/frontend/**`.

## Frontend Boundaries

- Keep app shell, routing, and renderer-specific entrypoints inside the owning
  app directory.
- Put shared React DOM UI in `libs/frontend/ui-web`, shared native UI in
  `libs/frontend/ui-native`, runtime helpers in `libs/frontend/runtime`, and API
  request/client code in `libs/frontend/api-support` or
  `libs/frontend/api-client`.
- Frontend code must not import backend libraries or backend-only aliases.
- Respect Feature-Sliced Design tags and run `pnpm run frontend:fsd:check` for
  frontend structure/import changes.
- App-level `package.json` files list app-local direct dependencies only;
  platform-wide frontend dependencies belong in `libs/frontend/package.json`.

## App Notes

- No frontend is the repository default. Select the owning app explicitly for
  features, routes, tests, domains, and deployment changes.
- `admin-app` and `user-app` are Vite React SPAs.
- `landing-app` is Astro with React islands.
- `site-app` is Vike + React SSR.
- `mobile-app` is Expo/React Native and should consume
  `@app/frontend-ui-native`, not web-only UI primitives.
- Add a genuinely separate frontend only when it has distinct product or
  runtime ownership. Use `pnpm nrb add app ...`; do not add a generic shell
  beside the real applications.

## Agent Workflows

- Plan cross-owner frontend work with `$plan-frontend-change` before changing structure.
- Use `$design-frontend-experience` for new visual direction or substantial UX changes.
- Implement through `$develop-web-frontend` or `$develop-mobile-frontend`, then
  prove the result with `$validate-frontend-quality`.
- Use `$maintain-documentation` when behavior, commands, ownership, or agent routing changes.
