# First feature walkthrough

This walkthrough is the preferred path for shipping a small vertical slice without rediscovering repository conventions. It shows both the `pnpm nrb add feature` path and the legacy `pnpm generate:feature` path — they use the same engine.

## 1. Pick a slice and dry-run the scaffold

### Unified CLI (recommended)

```bash
pnpm nrb add feature invoices \
  --api-app user-app-api \
  --frontend-app user-app \
  --dry-run
```

### Legacy alias (equivalent)

```bash
pnpm generate:feature invoices -- \
  --api-app user-app-api \
  --frontend-app user-app \
  --dry-run
```

The scaffold lists the files it would create for:

- backend shared DTOs/permissions under `libs/backend/feature/<name>/shared/lib`;
- an authenticated, RBAC-protected Nest module/controller/service under `libs/backend/feature/<name>/main/lib`;
- a MikroORM module, `ResultAsync` repository, entity, and timestamped migration under `libs/backend/postgres/main/<name>/lib`;
- an FSD page boundary under the selected frontend app's `src/pages/<name>` root;
- a completion guide under `docs/features/<name>/scaffold.md`.

The generator wires the feature module into the selected API. It intentionally does not hand-write generated OpenAPI contracts or frontend clients.

Remove `--dry-run` when the file plan is correct:

```bash
# Unified CLI:
pnpm nrb add feature invoices \
  --api-app user-app-api \
  --frontend-app user-app

# Legacy alias:
pnpm generate:feature invoices -- \
  --api-app user-app-api \
  --frontend-app user-app
```

### Target a different API app

```bash
pnpm nrb add feature invoices --api-app admin-app-api --frontend-app admin-app
```

### Change an existing feature

Do not run the generator again and do not create an `invoices-new` or
`invoices-v2` slice. Inspect the owning API module, backend feature libraries,
PostgreSQL library, and frontend route, then modify those files in place.
`pnpm nrb add --force` is intentionally rejected.

## 2. Verify backend ownership

1. Review the generated API-module import and the default read/write permission names.
2. Replace the generic `name` model with the product fields and invariants for the feature.
3. Review the timestamped migration SQL and add indexes/constraints required by the access pattern.
4. Add controller/service/repository tests for validation, authorization, persistence failure, and concurrency behavior.

## 3. Wire frontend ownership

1. Generate the API client from OpenAPI and consume it through a frontend-owned wrapper.
2. Add the page to the selected app route tree.
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

## Next steps

- [Adding a New Service](usage/adding-a-new-service.md) — create and wire a NestJS backend service.
- [Adding a New Frontend Page](usage/adding-a-new-frontend-page.md) — add a route, page, and tests to a frontend app.
- [CLI Reference](setup/cli-reference.md) — full reference for `pnpm nrb add` and related commands.
