# Adding a New Frontend Page

Frontend structure follows Feature-Sliced Design (FSD). Put a route-level UI
boundary under the owning app's `src/pages/<feature>` directory and keep shared
API/state/UI logic in the appropriate frontend library or lower FSD layer.

## 1. Choose the owning app

| App           | Path                    | Renderer          | Role                              |
| ------------- | ----------------------- | ----------------- | --------------------------------- |
| `admin-app`   | `apps/frontend/admin`   | React + Vite      | Admin/RBAC flow                   |
| `user-app`    | `apps/frontend/app`     | React + Vite      | Canonical authenticated user flow |
| `landing-app` | `apps/frontend/landing` | Astro             | Public marketing pages            |
| `site-app`    | `apps/frontend/site`    | Vike + React SSR  | SSR product/site routes           |
| `mobile-app`  | `apps/frontend/mobile`  | Expo/React Native | Mobile screens                    |

## 2. Generate a vertical page boundary

When the page belongs to a backend feature, use the vertical generator:

```bash
pnpm nrb add feature invoices \
  --api-app user-app-api \
  --frontend-app user-app \
  --dry-run
pnpm nrb add feature invoices \
  --api-app user-app-api \
  --frontend-app user-app
```

It creates
`apps/frontend/app/src/pages/invoices/ui/InvoicesPage.tsx` and a public
`src/pages/invoices/index.ts`. It also creates and wires backend feature and
PostgreSQL libraries. Generated OpenAPI and API-client output remain generated
artifacts and must be refreshed after the API builds.

For a frontend-only page, create the same `src/pages/<feature>/ui` plus
`index.ts` public boundary manually. Do not create obsolete
`src/app/features/<feature>` roots.

## 3. Register routing in the owning renderer

Routing is app-owned; there is no repository-wide React Router assumption.

- `user-app` owns routing in
  `apps/frontend/app/src/app/router/user-router.tsx`.
- `admin-app` owns its explicit route composition in
  `apps/frontend/admin/src/App.tsx`.
- Astro routes are filesystem pages under
  `apps/frontend/landing/src/pages/**`.
- Vike routes are filesystem pages under `apps/frontend/site/pages/**` and use
  `+Page.tsx` / `+config.ts` conventions.
- Expo Router routes live under `apps/frontend/mobile/src/app/**`; reusable
  screen UI remains under `src/pages/**`.

Import the page only through its `index.ts` public boundary. Add a not-found
path and preserve auth/RBAC guards where the owning app requires them.

## 4. Add API ownership

After a backend route compiles:

```bash
pnpm api:openapi
pnpm api:contracts
pnpm api:clients
```

Consume generated clients through `@app/frontend-api-client` and a
frontend-owned wrapper. Do not import backend DTOs or hand-edit generated
OpenAPI/client files.

The page must explicitly handle loading, empty, recoverable error, forbidden,
and success states as applicable. User-facing copy must use the owning i18n
boundary.

## 5. Test and verify

Add unit/component tests next to the owning page or app convention, then add e2e
coverage for navigation and public behavior.

```bash
pnpm run frontend:fsd:check
pnpm exec nx run user-app:lint
pnpm exec nx run user-app:typecheck
pnpm exec nx run user-app:test
pnpm exec nx run user-app:build
pnpm exec nx run user-app:e2e
git diff --check
```

Replace `user-app` with the selected project. Add Storybook coverage when a
reusable shared UI state is introduced.

## 6. Public hostname and API routing

An additional page normally shares its app's hostname. A new frontend app does
not: it needs an explicit product-owned hostname, same-origin or split-origin
API routing decision, CORS/CSP updates, ingress, DNS, TLS, and deployment
registration. See
[Scaffolding and Extension Contract](../scaffolding-and-extension.md) and
[Frontend Deployment Topology](../frontend-deployment-topology.md).

## Next steps

- [First Feature Walkthrough](../first-feature-walkthrough.md)
- [Frontend FSD](../frontend-fsd.md)
- [API Client](../api-client.md)
