# Multi-tenancy capability design

Design for a setup-selectable multi-tenancy capability, derived from reviewing two
production monorepos built on this template's lineage: `social-agents` (backend
row-level-security enforcement) and `opwerf` (tenant switching in the frontend).

Status: **design only.** Nothing in this document is implemented yet. It exists so
the work can be executed as a normal spec → plan → implement cycle rather than
improvised.

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

1. **New lib `@app/backend-common-tenant-context`** (`type:common`,
   `platform:backend`), holding the transaction seam, the connection hook, the
   interceptor, and the exemption decorators. It depends only on
   `@app/backend-common-request-context`, so it introduces no cycle.
2. **Migrations per provider.** Postgres: create the restricted app role and the
   system role, enable `ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on every
   tenant-scoped table, and add one policy per table reading
   `current_setting('app.current_tenant', true)`. Index-name budget still applies
   (63 characters).
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
