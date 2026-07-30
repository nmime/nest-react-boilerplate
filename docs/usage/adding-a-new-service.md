# Adding a New Service

Use the repository generator. Do not run a generic Nx Node generator, copy an
existing API, move directories manually, or create a top-level `services/`
tree.

## 1. Choose the process type

- `nest-api` creates an HTTP NestJS/Fastify deployable with the repository
  bootstrap and standard health surface.
- `consumer` creates a Nest application-context event/queue consumer without
  HTTP transport.
- `scheduler` creates a Nest application-context scheduled-job process and
  owns `ScheduleModule.forRoot()`.

The first name segment is the backend scope. For example,
`billing-app-api` is generated at
`apps/backend/billing/billing-app-api`.

## 2. Inspect and generate

```bash
pnpm nrb add app billing-app-api \
  --kind backend \
  --renderer nest-api \
  --port 3200 \
  --dry-run

pnpm nrb add app billing-app-api \
  --kind backend \
  --renderer nest-api \
  --port 3200
```

For a consumer or scheduler:

```bash
pnpm nrb add app billing-consumer \
  --kind backend \
  --renderer consumer \
  --dry-run

pnpm nrb add app billing-scheduler \
  --kind backend \
  --renderer scheduler \
  --dry-run
```

The generator creates `project.json`, TypeScript/test configuration, Nest
entrypoint and module, tests, plus nearest `README.md` and `AGENTS.md`. It does
not create an application package manifest.
A `nest-api` scaffold already uses `bootstrapNestApi` and exposes `/health`,
`/health/private`, `/live`, and `/ready`.

## 3. Prove the generated project

```bash
pnpm exec nx show project billing-app-api
pnpm exec nx run billing-app-api:build
pnpm exec nx run billing-app-api:test
pnpm exec nx run billing-app-api:serve
```

Do not hand-edit `pnpm-lock.yaml`. Review the generated Nx tags and local port
before adding product code. If the service needs a missing external package,
declare it in `libs/backend/package.json`, run `pnpm install`, and prove a
subsequent `pnpm install --frozen-lockfile`.

## 4. Add domain logic through libraries

Keep the deployable thin. Reusable business logic belongs under
`libs/backend/feature/<scope>/**`; persistence belongs under
`libs/backend/postgres/main/<scope>/**`; cross-runtime contracts belong under
`libs/common/**`.

For a complete feature slice:

```bash
pnpm nrb add feature invoices \
  --api-app billing-app-api \
  --frontend-app user-app \
  --dry-run
```

Then run without `--dry-run`, replace generic model fields with product
invariants, and review RBAC, validation, indexes, rollback, repository errors,
and concurrency.

## 5. Register selection only when intended

Generation does not silently add the service to every preset. If setup should
select it:

1. Add its stable ID to `packages/tooling/src/setup/schema.ts`.
2. Add required apps/capabilities in `packages/tooling/src/setup/catalog.ts`.
3. Add it only to the intended preset(s) in `presets.ts`.
4. Update schema, catalog, planner, and preset tests.
5. Run `pnpm nrb setup --preset <preset> --dry-run --json` and inspect the
   resolved dependency closure.

Leave experimental or independently started services out of presets until
their ownership is deliberate.

## 6. Complete runtime and public API ownership

Before calling the service ready:

- define environment validation and secret ownership;
- wire PostgreSQL/Redis/NATS only when required;
- preserve CLS request IDs and RFC 9457 errors;
- add auth/RBAC, rate limits, OpenAPI, metrics, and migrations as applicable;
- add local Compose/dev-orchestrator registration if it belongs in the selected
  local stack;
- add Docker image/build ownership and Helm Deployment/Service values;
- define probes, resources, NetworkPolicy, an `<app-id>.<root-domain>` ingress
  route, DNS, TLS, and observability;
- add the new origin to CORS/CSP and frontend API-base configuration;
- regenerate OpenAPI/contracts/clients and add integration/e2e coverage.

The generator intentionally does not publish DNS or TLS. Register the service
in the setup catalog with `<app-id>.example.com`, then provision the initialized
`<app-id>.<root-domain>` hostname (the apex exception is frontend-only) by following the full checklist in
[Scaffolding and Extension Contract](../scaffolding-and-extension.md).

## 7. Verify

```bash
pnpm run tooling:static-check
pnpm run db:migrations:check
pnpm run api:contracts:check
pnpm run api:clients:check
pnpm exec nx run billing-app-api:lint
pnpm exec nx run billing-app-api:typecheck
pnpm exec nx run billing-app-api:test
pnpm exec nx run billing-app-api:build
git diff --check
```

Add component, Docker smoke, and fullstack e2e checks when the service joins
shared runtime or public traffic.

## Next steps

- [Scaffolding and Extension Contract](../scaffolding-and-extension.md)
- [API Contracts](../api-contracts.md)
- [Database Migrations](../database-migrations.md)
- [Frontend Deployment Topology](../frontend-deployment-topology.md)
