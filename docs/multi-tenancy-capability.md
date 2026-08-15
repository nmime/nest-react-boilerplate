# Multi-tenancy capability design

Design for a setup-selectable multi-tenancy capability, derived from reviewing two
production monorepos built on this template's lineage: `social-agents` (backend
row-level-security enforcement) and `opwerf` (tenant switching in the frontend).

Status: **stage 1 is implemented but deliberately not registered; stage 2 is
partially implemented — the enforcement seam is proven, but the row-level-security
policies were rolled back; stages 3–6 vary.** It is an opt-in capability, and a
project that does not select it is completely unaffected. See [Progress](#progress).

## Progress

| Stage                                                         | State                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. Ambient tenant scope + fail-closed interceptor             | **Partial** — lib and `TenantContextModule` exist but are NOT registered by the capability |
| 2. PostgreSQL roles, RLS policies, isolation proof            | **Partially done** — seam + proof implemented; RLS policies rolled back                    |
| 3. MongoDB repository-level guard                             | Not started — tenancy therefore conflicts with `mongodb`                                   |
| 4. Tenant lifecycle workflows (CRUD, membership, invitations) | Not started                                                                                |
| 5. Frontend tenant provider and switcher                      | Not started                                                                                |
| 6. `--capability tenancy` setup wiring                        | **Done** — catalog entry, gated migrations, closure and Helm selection                     |

### What is true today

The DDL is correct and it is proven where it matters. `tenant-transaction.component-spec.ts`
runs against a real PostgreSQL **as a non-superuser table owner**, which is the
shape of every managed deployment — a suite that connects as the container
superuser proves nothing, because a superuser bypasses row-level security even
under `FORCE`. It grants itself nothing: every privilege the seam needs has to
come out of `tenantAppRoleUpSql()`, i.e. out of the migration.

Selecting the capability is what installs any of it. With tenancy deselected,
`capabilityMigrations` is empty and no policy, role or grant reaches the
database. Note what changed: the row-level-security install migrations were
removed and superseded by idempotent reversals
(`Migration20260804120000RemoveTenantRowLevelSecurity`,
`Migration20260804120000RemoveNotificationTenantRowLevelSecurity`) that run in
the base migration sets — on every database, tenancy selected or not — because a
previous version shipped the policies unconditionally. Selecting tenancy
therefore contributes no DDL today; the capability owns the roles' creation SQL
and the component proof, not policy installation.

### What is NOT true yet

**No repository routes through `withTenantTransaction`.** The helpers and the
interceptor exist, and nothing in the request path calls them. The policies
themselves are not installed: they were installed once and then rolled back
because no runtime path engaged them — nothing set the `app.current_tenant` GUC
or switched roles on the live request path, and every deployment connects as a
`BYPASSRLS`/superuser pool role, so fail-closed policies protected nothing
while making any future restricted-role connection return zero rows. Until a
connection path actually runs tenant-scoped statements as the restricted role
(and the pools stop using `BYPASSRLS` roles), isolation is application-enforced
via tenant predicates, not a database guarantee. Stage 1 is deliberately marked
Partial for this reason. Do not select `--capability tenancy` for a real product
until the repository routing lands.

**The capability therefore does not register `TenantContextModule`.** That was
tried and reverted within this work: the module registers a fail-closed
interceptor, so wiring it into an application whose routes cannot resolve a
tenant turns working endpoints into 500s — the enterprise preset's e2e suite
caught `GET /api/auth/get-session` returning 500 instead of 200. The interceptor
was behaving exactly as designed; the application simply could not satisfy it
yet. Registration belongs in the same change as the repository routing, because
neither half is correct alone.

### Two things this design got wrong first, both worth knowing

- **`BYPASSRLS` is not available to us.** Only a role that already holds it may
  create another one, so a migration running as an ordinary managed-Postgres
  owner cannot mint the system role the original design assumed. Cross-tenant
  work instead runs as `nrb_system`, whose policy on every policied table is
  `using (true)`. No superuser is needed anywhere.
- **Role membership must be granted `WITH INHERIT FALSE`.** A policy targeted
  `TO <role>` applies to every _member_ of that role, not only to a session that
  assumed it. Granting membership the default way hands the application's own
  connection the system role's `using (true)` policy permanently, and it reads
  every tenant without ever calling `SET ROLE`. The component test asserts this
  directly.

Row-level security here is a tenant-isolation control, not a sandbox against SQL
injection: both roles are granted to the same connecting user, so a session that
has assumed `nrb_app` can assume `nrb_system`.

MongoDB deployments get no equivalent enforcement (stage 3), and there is no
tenant management UI or API (stages 4–5).

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
2. Postgres roles, RLS policies, and the isolation component tests. The seam and
   proof exist; the policies were rolled back and this stage re-opens once a
   runtime path engages them (restricted-role connection path + non-`BYPASSRLS`
   pools), at which point the component tests become the acceptance gate again.
3. MongoDB repository-level guard and its tests.
4. Tenant lifecycle workflows (CRUD, membership, invitations).
5. Frontend tenant provider and switcher.
6. `--capability tenancy` setup wiring, closure selection, and Helm/compose values.
