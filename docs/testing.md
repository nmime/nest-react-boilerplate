# Testing matrix

The canonical QA matrix now lives in [Modern QA and testing matrix](testing/modern-qa.md).

Fast PR confidence still centers on:

```bash
pnpm run format:check
pnpm run api:contracts:check
pnpm run api:clients:check
pnpm run api:openapi:lint
pnpm run test:property
pnpm run lint
pnpm run typecheck
pnpm run test
```

The normal lint, typecheck, unit, coverage, component, and e2e commands are product commands:
they require a current `.nrb/closure.json` and run every transitive closure
project that owns the requested target. Template CI and repository maintainers
use the explicit `lint:all`, `typecheck:all`, `test:all`, `test:coverage:all`, `test:component:all`,
`test:e2e:all`, and `test:e2e:coverage:all` sweeps instead of inventing a
default product selection.

Normative requirements, Cucumber acceptance examples, and independent evidence
lanes are described in
[Specification assurance](specification-assurance.md). Start with:

```bash
pnpm run spec:validate
pnpm exec nx run acceptance-e2e:acceptance
pnpm run spec:verify -- --lane pr --base origin/main --head HEAD
```

Every repository-owned executable `*.spec.*`, `*.test.*`, `*.e2e-spec.*`, or
`*.component-spec.*` file carries one `// @requirements REQ-...` inventory
marker. Filename-shaped command modules such as `storybook-test.ts` are
excluded. The marker links the whole file to durable behavior and project
ownership; `verification.yaml` separately selects the high-signal evidence
that satisfies each risk profile. Its version 3 Cucumber disposition makes
acceptance evidence mandatory where selected and requires a concrete reason
plus mapped alternative evidence everywhere else.

Run heavier suites intentionally: `test:component`, `test:e2e`, `test:storybook`, `test:visual`, `test:docker-smoke`, `test:fullstack`, and the nightly/manual presets (`api:openapi:fuzz`, `test:a11y`, `test:e2e:matrix`, `test:perf`, `test:security:dast`, `test:mutation`).

`pnpm run test:fullstack` fails closed unless `fullstack-e2e` belongs to the
fresh selected closure. Its Compose graph, database provider, applications, and
capability infrastructure come from that closure; environment profile overrides
cannot reduce the selected service set or add stale applications.

## Durable-provider proof

PostgreSQL and MongoDB are separate persistence implementations behind shared
behavioral ports. Unit tests prove mapping, validation, retries, CAS filters,
tenant scope, and claim-token fencing. Component tests prove the actual database
semantics and must not be replaced by mocks:

```bash
pnpm exec nx run @app/backend-mongodb-main:component-test
pnpm exec nx run @app/backend-mongodb-main-auth:component-test
pnpm exec nx run @app/backend-mongodb-main-feature-flags:component-test
pnpm exec nx run @app/backend-mongodb-main-notification:component-test
pnpm run db:migrations:rollback-check # PostgreSQL only
```

MongoDB component suites require a transaction-capable replica-set
Testcontainer. They cover topology rejection, snapshot/majority/primary
transactions, bounded retries, atomic mutation/audit/outbox writes, migration
ledger replay and validator/index drift, per-tenant serialization,
expected-revision CAS, lease reclaim, and stale claim-token rejection. A
standalone MongoDB fixture is valid only for proving fail-closed rejection.

Provider behavior should match for authorization, tenant isolation, domain
results, idempotency, audit/outbox atomicity, and delivery state transitions.
Tests must not assert false physical parity: MongoDB has no foreign keys,
savepoints, or advisory locks; TTL cleanup is asynchronous; and collection,
validator, and index DDL is not transactional.

Database-operation tests should cover provider dispatch for migrate, reset,
seed, backup, restore, and restore drill. Before production, perform a real
restore into an isolated target for the selected provider; CI dry-run output
proves command construction and redaction, not recoverability.

## Reliability

For deterministic testing practices (fake timers, seed factories, quarantining), see [test reliability runbook](testing/test-reliability.md).

## Design-system and frontend tooling

- `pnpm run storybook` uses the single configuration in
  `libs/frontend/ui-web/lib/.storybook`. It serves reusable
  `@app/frontend-ui-web` stories plus explicitly registered screen
  compositions from `apps/frontend/{admin,app,landing,site}/storybook`.
- App-composition stories use deterministic state/i18n providers and inline the
  owning app CSS only while that story is active. They cover screen rendering
  and local interaction, not routing, production provider wiring,
  authentication, API integration, or complete page flows.
- `pnpm run storybook:build` writes the static Storybook artifact to
  `dist/storybook/frontend-ui-web`; `pnpm run test:storybook` runs all shared
  component and web app-composition stories in Chromium.
- `pnpm run test:visual` checks reviewed, platform-specific Chromium images for
  stories tagged `visual`; `pnpm run test:visual:matrix` expands the scheduled
  lane to desktop and mobile Chromium, Firefox, and WebKit profiles. Full-page
  capture includes Radix/shadcn portals. Baseline updates are explicit and must
  be reviewed; see the [visual regression contract](testing/modern-qa.md#visual-regression-contract).
- `pnpm run frontend:fsd:check` enforces frontend FSD layer tags, slice boundaries, and public API usage across `apps/frontend/**` and `libs/frontend/**`.
- `admin-app` and `user-app` e2e targets use Vite builds with
  `VITE_E2E_COVERAGE=true` plus the `frontend-browser-e2e-coverage` helper;
  update their `project.json` copy assertions when shell copy changes.
- `landing-app`, `site-app`, and `mobile-app` use renderer-specific Astro build,
  Vike SSR build, and Expo web-export smoke scripts. Those targets prove
  build/runtime artifacts but do not claim the Vite browser coverage contract.
- `mobile-app` is intentionally absent from the web Storybook because Expo and
  `@app/frontend-ui-native` require the native component/export/e2e lane.
