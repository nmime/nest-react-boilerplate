# Workspace Readiness Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all existing supported workspace projects pass dependency, format, lint, typecheck, build, and test gates on the approved Node 24 compatibility matrix.

**Architecture:** Repair systemic dependency and configuration causes before project-local symptoms. Keep dependency changes, frontend runtime fixes, tooling fixes, and infrastructure alignment in disjoint commits, then validate the integrated tree without Nx cache.

**Tech Stack:** pnpm 11, Nx 23, Node 24, TypeScript 6, React 19, Vite/Vitest, NestJS/Fastify, Better Auth, Docker Compose.

**Ownership:** Worker A owns package manifests/lockfile/Docker versions; Worker B owns frontend Better Auth and React tests; Worker C owns tooling types/tests; Worker D owns lint/format configuration and the confirmed backend lint error. Integration owner runs all gates and resolves only cross-slice conflicts.

**Autonomous Execution:** Apply latest compatible versions. Defer TypeScript 7, Babel 8 for Expo, or any major rejected by official peer ranges; record each in dependency docs. Never hide audits or disable tests. Fix shared causes before individual failures.

**Validation Evidence:** Save command logs under `/tmp/nrb-acceptance/`; require frozen install, zero actionable prod/dev advisories, no missing peers, format pass, lint pass, typecheck pass, builds pass, and unit/component/e2e pass.

**True Blockers:** Stop only when the registry is unavailable, a required service cannot start, or official peer ranges make two required supported apps mutually incompatible. Record the exact command, peer range, and closest passing subset first.

---

### Task 1: Normalize dependencies and runtime images

**Files:**
- Modify: all 15 workspace `package.json` files with stale compatible versions
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `Dockerfile`
- Modify: Docker Compose files containing floating images
- Modify: `docs/dependency-management.md`

- [ ] Capture `pnpm outdated -r --long`, `pnpm audit --prod`, `pnpm audit --dev`, `pnpm ls -r --depth 0`, and registry latest values.
- [ ] Write a compatibility matrix that keeps Node 24, TypeScript 6, and Expo-supported Babel/React Native versions.
- [ ] Update all compatible direct versions, remove stale duplicate pins, align Docker pnpm to 11.11.0, and pin MinIO/NATS to explicit tested tags.
- [ ] Run `pnpm install --lockfile-only`, then `pnpm install --frozen-lockfile` and require exit 0.
- [ ] Trace every dev advisory with `pnpm why <package>` and update/remove/override the actual vulnerable importer; require both prod and dev audit gates to report no actionable installed vulnerable version.
- [ ] Commit with `fix(deps): align compatible workspace dependencies`.

### Task 2: Repair frontend API and React test runtime

**Files:**
- Modify: `libs/frontend/api-client/lib/src/auth-client.ts`
- Modify: `libs/frontend/api-client/lib/src/telegram-client.ts`
- Modify: affected frontend Vitest configs and setup files
- Modify: affected frontend root tests
- Test: API client unit tests and admin/user/landing/site app tests

- [ ] Add failing compile-time tests for the supported Better Auth client plugin imports and options.
- [ ] Replace removed exports with the current Better Auth plugin API while preserving public client behavior.
- [ ] Add a failing React render/cleanup test that reproduces `React.act is not a function`.
- [ ] Correct Vitest conditions/environment so React's development test runtime is used; do not monkey-patch `act`.
- [ ] Run all frontend API-client and app tests without cache, then typecheck and build each frontend app.
- [ ] Commit with `fix(frontend): restore auth clients and React test runtime`.

### Task 3: Repair tooling typecheck and tests

**Files:**
- Modify: `packages/tooling/src/commands/testing/frontend-browser-e2e-coverage.ts`
- Modify: `packages/tooling/package.json`
- Modify: tooling tsconfig/type declarations only where required
- Test: existing tooling test files

- [ ] Add a typecheck regression fixture for the callback currently inferred as `any`.
- [ ] Type the callback from its source API rather than annotating it as broad `any`.
- [ ] Add direct dependencies/types for modules imported by tooling tests, including `fast-check` and Istanbul types where confirmed by compiler output.
- [ ] Run `pnpm --filter @repo/tooling typecheck`, its complete unit suite, and `tooling static-check`.
- [ ] Commit with `fix(tooling): make static checks self-contained`.

### Task 4: Repair lint and formatting scope

**Files:**
- Modify: the MikroORM repository file reported by `@app/backend-postgres-main-auth:lint`
- Modify: `.prettierignore` only for generated/vendor artifacts
- Modify: source files reported after exclusions

- [ ] Re-run the failing lint target and add a focused test for the repository method binding behavior.
- [ ] Replace the unbound method reference with a bound wrapper or direct invocation preserving `this`.
- [ ] Classify all Prettier failures; exclude only generated artifacts with documented generators, never source code.
- [ ] Format source-controlled files, then run `pnpm format:check` and full Nx lint with bounded parallelism.
- [ ] Commit with `style: normalize source formatting and lint`.

### Task 5: Integrated readiness acceptance

**Files:**
- Modify only files required by a proven integrated failure

- [ ] Run frozen install and peer/audit gates.
- [ ] Run `nx run-many -t typecheck --all --skip-nx-cache --parallel=3`.
- [ ] Run `nx run-many -t lint --all --skip-nx-cache --parallel=3`.
- [ ] Run `nx run-many -t test --all --skip-nx-cache --parallel=2`.
- [ ] Run every build target without cache and record project counts.
- [ ] Start disposable services and run component and E2E targets; always tear them down.
- [ ] Commit any proven integration-only repair separately and store the final evidence summary in the campaign ledger.
