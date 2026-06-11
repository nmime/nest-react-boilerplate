# First feature walkthrough

This walkthrough is the preferred path for shipping a small vertical slice without rediscovering repository conventions.

## 1. Pick a slice and dry-run the scaffold

```bash
pnpm generate:feature invoices -- --dry-run
```

The scaffold lists the files it would create for:

- backend shared DTOs/permissions under `libs/backend/feature/<name>/shared/lib`, with frontend-specific feature contracts under `libs/frontend/feature/<name>/shared/lib` when required;
- Nest module, controller, service, and tests under `libs/backend/feature/<name>/main/lib`;
- PostgreSQL entity and migration placeholder under `libs/backend/postgres/main/<name>/lib`;
- frontend API client stub under `libs/frontend/api-client/lib/src/features`;
- React page stub under `apps/frontend/app/src/app/features/<name>`;
- a test checklist under `docs/features/<name>/test-checklist.md`.

Remove `--dry-run` when the file plan is correct:

```bash
pnpm generate:feature invoices
```

## 2. Wire backend ownership

1. Import the generated `<Feature>Module` into the API that owns the route, usually `apps/backend/user-app-api/src/user-api.module.ts` or `apps/backend/admin-app-api/src/admin-app-api.module.ts`.
2. Replace placeholder service logic with a repository/provider boundary.
3. Replace `Migration00000000000000...` with a timestamped MikroORM migration generated from the real model.
4. Add RBAC guards and permissions before exposing non-public routes.

## 3. Wire frontend ownership

1. Export or import the generated API client from `libs/frontend/api-client/lib/src`.
2. Add the page to the owning app route tree (`apps/frontend/app`, `apps/frontend/admin`, or `apps/frontend/landing`).
3. Cover loading, empty, error, and success states with tests or Storybook stories.

## 4. Refresh contracts and clients

```bash
pnpm api:openapi
pnpm api:contracts
pnpm api:clients
```

If generated artifacts changed, commit them with the feature. If they did not change, make sure the route is mounted in the API module and Swagger decorators describe the response.

## 5. Validate before PR

```bash
pnpm db:migrations:check
pnpm lint
pnpm typecheck
pnpm test
```

For cross-app behavior, add `pnpm test:e2e`. For release-risk work, run `pnpm check`.
