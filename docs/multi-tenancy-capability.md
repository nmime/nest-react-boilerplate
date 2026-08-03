# Multi-tenancy capability design

Design for a setup-selectable multi-tenancy capability, derived from reviewing two
production monorepos built on this template's lineage: `social-agents` (backend
row-level-security enforcement) and `opwerf` (tenant switching in the frontend).

Status: **stages 1 and 2 are implemented and verified; stages 3–6 are not.** See
[Progress](#progress) for exactly what exists.

## Progress

| Stage                                                         | State                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Ambient tenant scope + fail-closed interceptor             | **Done** — `@app/backend-common-tenant-context`                        |
| 2. PostgreSQL roles, RLS policies, isolation proof            | **Done** — `@app/backend-postgres-main` + auth/notification migrations |
| 3. MongoDB repository-level guard                             | Not started                                                            |
| 4. Tenant lifecycle workflows (CRUD, membership, invitations) | Not started                                                            |
| 5. Frontend tenant provider and switcher                      | Not started                                                            |
| 6. `--capability tenancy` setup wiring                        | Not started                                                            |

What stages 1–2 give you: a tenant-scoped query that omits its predicate returns
no cross-tenant rows, because PostgreSQL refuses them — not because the
application remembered. A request that resolves no tenant is refused rather than
silently scoped to nothing. Proven by
`libs/backend/postgres/main/shared/lib/src/tenant-transaction.component-spec.ts`
against a real database, including a test that deliberately reproduces the
connection-pinning leak to show the seam is load-bearing.

What they do not give you: MongoDB deployments get no equivalent enforcement yet
(stage 3), and there is still no tenant management UI or API (stages 4–5), nor a
setup flag to select the capability (stage 6). `AUTH_PERSISTENCE=mongodb`
therefore remains application-enforced only.

Two known rough edges, both deliberate:

- `normalizeTenantId` and the default-tenant constant exist in both this lib and
  `@app/backend-feature-auth-shared`. Inverting that (auth importing from here)
  pulled this lib into the tooling test runner's module graph, where
  `@app/backend-*` aliases do not resolve. A test reads the auth source and
  asserts the constants match, so they cannot drift.
- The notification child tables (`notification_deliveries`,
  `notification_segment_members`, and similar) carry no `tenant_id` and are
  reachable only through a policied parent. That is the existing schema's choice,
  not something this work changed.

## Where the template stands today

[auth-tenant-hardening.md](auth-tenant-hardening.md) already ships the persistence
and transport scaffolding:

- `auth_tenants`, `auth_tenant_memberships`, `auth_tenant_invitations` on both
  providers, with slug/domain uniqueness, membership uniqueness, hashed invitation
  tokens, and status constraints.
- `tenant_id` on `auth_users`, auth principals, request guards, token stores, and
  rate-limit keys, defaulting to the `00000000-0000-0000-0000-000000000000`
  sentinel for single-tenant apps.
- `x-tenant-id` / `x-tenant-domain` header helpers in
  `@app/backend-feature-auth-shared`, with session guards rejecting a tenant
  mismatch.
- `@app/backend-common-request-context`, the CLS seam a tenant context needs.

**The gap is enforcement.** Tenant isolation is currently application-level only:
a repository method that forgets its `tenantId` predicate returns other tenants'
rows and nothing fails. Every other item below is secondary to closing that.

## What the reference repos do

### social-agents — Postgres row-level security

`libs/backend/common/tenant-context` is the whole enforcement story, and it maps
onto this template's lib layout unchanged:

| Unit                                                                                               | Responsibility                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant-transaction.ts`                                                                            | `withTenantTransaction(em, tenantId, work)` opens a transaction, `SET LOCAL role <app_role>`, `SET LOCAL app.current_tenant = ?`, then runs the work. `withSystemContext(systemEm, work)` handles legitimately cross-tenant operations. |
| `tenant-context.interceptor.ts`                                                                    | Mirrors the guard-resolved tenant id into CLS and **fails closed**: a tenant-scoped request with no tenant is an error, not a silent pass.                                                                                              |
| `tenant-connection.hook.ts`                                                                        | Sets the GUC at connection checkout, so ORM operations outside an explicit transaction are still scoped.                                                                                                                                |
| `tenant-scope-exempt.decorator.ts`                                                                 | `@Public()`, `@Health()`, and `@TenantScopeExempt('<reason>')` are the only ways to opt out, each self-documenting.                                                                                                                     |
| `tenant-job-scope.ts`, `tenant-ingress-scope.ts`, `tenant-claim-scope.ts`, `tenant-claim-guard.ts` | Extend the same ambient scope to queue consumers, webhook ingress, and claim-based access.                                                                                                                                              |

Two design decisions are worth copying verbatim:

1. **Two database roles.** Tenant-scoped statements run as a restricted,
   non-`BYPASSRLS` role so `FORCE ROW LEVEL SECURITY` is genuinely enforced;
   cross-tenant work uses a separate `BYPASSRLS` system connection. Trying to
   express "system" as a magic GUC value does not work once policies are
   fail-closed — there is no value that yields rows across tenants.
2. **Connection pinning.** With MikroORM, raw `Connection.execute()` binds to the
   transaction's connection _only_ when `em.getTransactionContext()` is passed.
   Without it `SET LOCAL` evaporates onto an arbitrary pooled connection and the
   statement silently runs as the pool's superuser role, defeating RLS entirely.
   ORM operations thread this automatically; hand-written SQL must pass it.

### opwerf — frontend tenant surface

`TenantSwitcher` and `TenantConfig` components plus tenant-aware RBAC
permissions. Smaller in scope, and the part this template can adopt most cheaply
because `libs/frontend/feature/*` already has the shape for it.

## Proposed shape for this template

### Backend

1. **`@app/backend-common-tenant-context`** (`type:common`, `platform:backend`) —
   **implemented.** Holds the ambient scope (`withAmbientTenant`,
   `requireAmbientTenantId`), the fail-closed `TenantContextInterceptor`, and
   `@TenantScopeExempt`. It depends only on
   `@app/backend-common-request-context`.

   Note the divergence from `social-agents`: the transaction seam does **not**
   live here. `checkProviderScopedRuntimeImports` forbids `libs/backend/common/**`
   from importing `@mikro-orm/*` at all, so the ORM-facing half belongs to the
   provider.

2. **`@app/backend-postgres-main` + per-domain migrations** — **implemented.**
   `withTenantTransaction` / `withSystemContext` plus the shared policy SQL, and
   migrations in the auth and notification sets.

   The policies are installed **per migration set, not centrally**: the sets run
   independently, so a single cross-domain migration fails with
   `relation "notification_broadcasts" does not exist`. `auth_tenants` gets a
   policy keyed on its own `id`, since its primary key _is_ the tenant.

3. **MongoDB has no RLS.** Enforcement there must be a repository-layer guard —
   a base repository that injects the ambient tenant filter and throws when the
   ambient tenant is missing. This asymmetry needs stating in the docs rather
   than papered over: the two providers give different guarantees.
4. **Tenant lifecycle feature lib** for CRUD, membership management, and
   invitation acceptance, which today's doc explicitly defers.

### Frontend

5. A `scope:shared` tenant-context provider plus a tenant switcher in
   `libs/frontend/feature/shared/*`, following the pattern established by
   `@app/frontend-feature-shared-preferences`.

### Setup capability

6. A `--capability tenancy` flag, so a scaffolded project either gets the whole
   stack or stays on the single-tenant sentinel. This is the "from scratch"
   requirement, and it is what makes the feature safe to add: existing
   single-tenant apps must be unaffected.

## Assurance this needs

Multi-tenancy is exactly the kind of feature where a passing test suite proves
little. At minimum:

- **Component tests against a real Postgres** (Testcontainers, already available)
  asserting that a query issued under tenant A cannot see tenant B's rows —
  including through raw SQL, which is where the connection-pinning bug hides.
- **A negative test that the restricted role cannot bypass RLS**, so a future
  migration that accidentally grants `BYPASSRLS` fails the suite.
- **A fail-closed test** proving a tenant-scoped request with no resolved tenant
  errors rather than returning an empty result set.
- Property-based checks that every tenant-scoped repository method rejects a
  missing ambient tenant.

## Sequencing

The capability is large enough that it should land in stages, each independently
green:

1. `tenant-context` lib + CLS wiring + fail-closed interceptor (no RLS yet).
2. Postgres roles, RLS policies, and the isolation component tests.
3. MongoDB repository-level guard and its tests.
4. Tenant lifecycle workflows (CRUD, membership, invitations).
5. Frontend tenant provider and switcher.
6. `--capability tenancy` setup wiring, closure selection, and Helm/compose values.
