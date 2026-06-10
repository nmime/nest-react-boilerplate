# Local verification, artifacts, and fallback CI policy

GitHub-hosted Actions may be unavailable for this repository/account. When that happens, a trusted local or CI runner with repository access is the source of truth.

## Canonical local gate

Run the full gate from a clean `main` checkout with Node.js `>=26 <27` and pnpm `11.5.2`:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm run format:check
pnpm run tooling:static-check
pnpm run check
node scripts/validate-deployment-config.mjs
node scripts/validate-helm-rate-limit-config.mjs
pnpm exec nx run-many -t lint --all
pnpm exec nx run-many -t typecheck --all
pnpm exec nx run-many -t build --all
pnpm run test:coverage
pnpm run test:e2e:coverage
pnpm run storybook:build
pnpm run test:storybook
pnpm run test:visual
pnpm run test:a11y
pnpm run test:security:sast
pnpm run test:security:secrets
pnpm run audit
pnpm run quality:presets
pnpm run test:docker-smoke
pnpm run test:fullstack
```

Docker smoke and fullstack tests now choose collision-resistant port defaults and unique Compose project names. To reproduce a fixed layout, set `DOCKER_TEST_PORT_BASE`, `COMPOSE_PROJECT_NAME`, or the individual `*_PORT` variables before running the scripts.

The PR/push CI workflow exposes a focused `Non-runtime validation gates` job after `ci:pr` and dependency installation. It hard-gates migration and library configuration standards, generated OpenAPI contract and client freshness, OpenAPI lint, consumer contracts, bounded OpenAPI fuzz case generation, and property-based invariants without adding Docker, Helm runtime, or deployed-service requirements to that job.

## Pass 3 targeted validation

When validating auth/session and preference-token fix-forward work, use the same Node and pnpm versions as CI, install from the lockfile, then run the fast aggregate plus the focused projects/specs that cover the risky paths:

```bash
nvm use 26.1.0
pnpm --version # 11.5.2
pnpm install --frozen-lockfile
pnpm run check:fast
pnpm exec nx run @app/common/bootstrap:test
pnpm exec vitest run apps/frontend/admin/src/app/preference-token.spec.tsx
pnpm exec vitest run libs/backend/feature/auth/main/lib/src/lib/auth-token-store.spec.ts libs/backend/postgres/main/auth/lib/src/lib/repository/auth-token.repository.spec.ts
```

For private-repository sandbox validation, prefer an authenticated full checkout or archive download before attempting file-by-file reconstruction. If credentials are not available inside the sandbox and nested source/archive retrieval is blocked, use GitHub Actions or a trusted local checkout for these commands rather than validating against a partial tree.

## Private repository sandbox fallback

Disposable sandboxes do not automatically inherit repository credentials. If the repository is private and a full checkout is unavailable, avoid retrying unauthenticated `git clone`, codeload, or archive downloads; those endpoints are expected to fail or return incomplete evidence without a repo-scoped credential.

Use the connected GitHub API/MCP for targeted evidence instead:

- Read PR metadata, diffs, changed files, and combined commit status through authenticated GitHub tooling.
- Read repository files through `get_file_contents`. When a sandbox needs a copy of a file, use the `download_url` returned for that exact file/ref. Treat those URLs as scoped, short-lived credentials; do not paste them into logs and do not reuse a root-file token for nested paths.
- Reconstruct only the files needed for static checks or focused script validation. Do not treat file-by-file reconstruction as a substitute for the canonical full gate.
- If combined status is `pending` with `total_count: 0`, or check-run/workflow/log/artifact APIs are inaccessible to the token, record that as an access limitation and use GitHub Actions with sufficient permissions, an authenticated checkout, or a trusted local/CI runner for definitive results.

## Coverage gates

The Vitest coverage gate is configured in `config/vitest-coverage.mts`. Workflow labels should say "configured coverage gates" unless those thresholds are deliberately raised. Storybook stories and generated clients are excluded from coverage because they are QA fixtures or generated output, not production logic.

## Tracked generated and binary artifacts

Generated OpenAPI clients under `generated/` and visual baseline PNGs under `packages/tooling/baselines/visual/` are intentionally tracked so consumers and visual regression tests are reproducible without extra generation steps. Treat changes to these files as generated artifacts:

- regenerate API clients with `pnpm run api:clients`; verify with `pnpm run api:clients:check`;
- update visual baselines only with `pnpm run test:visual:update`, then verify with `pnpm run test:visual`;
- review generated/binary diffs together with the source API/schema/story change that caused them.

## Tooling and migration rollback checks

`pnpm run tooling:static-check` is the deterministic static gate for repo operational tooling. It runs `node --check` over `packages/tooling/bin/**/*.mjs` and `packages/tooling/src/commands/**/*.ts`, performs safe CLI import-smoke checks for help-only commands, and verifies root/package tooling script path references. It does not execute destructive, deploy, Docker, or runtime-heavy scripts. The root `check:fast` and `check` aggregates include it before broader lint/typecheck/test gates.

`pnpm run db:migrations:rollback-check` (also exposed as `pnpm run test:migrations:rollback`) is the real rollback validation command. It starts disposable PostgreSQL through Testcontainers, runs auth migrations up/down/up, and requires Docker/Testcontainers. Keep it out of non-runtime PR jobs that cannot provide Docker, but run it from Docker-capable ops/scheduled CI or by configuring `QA_MIGRATION_ROLLBACK_COMMAND=pnpm run db:migrations:rollback-check` for the runtime ops gate. A synthetic world-class fallback must not be treated as real rollback evidence.

## Script map

- `pnpm run check`: full aggregate for formatting, tooling static validation, migrations, contracts, QA presets, lint, typecheck, and unit tests.
- CI `Non-runtime validation gates`: focused PR/push job that runs `db:migrations:check`, `lib:configs:check`, `api:contracts:check`, `api:clients:check`, `api:openapi:lint`, `api:contracts:consumer`, `api:openapi:fuzz`, and `test:property` after `ci:pr` and lockfile installation.
- `pnpm run tooling:static-check`: deterministic static syntax/import/reference validation for repo tooling scripts without running destructive or runtime-heavy commands.
- `pnpm run db:migrations:rollback-check`: Docker/Testcontainers-backed real migration rollback validation; also reachable through `pnpm run test:migrations:rollback`.
- `node scripts/validate-deployment-config.mjs`: static assertions for Docker, Helm, environment examples, nginx routing, production secret handling, and Redis rate-limit configuration.
- `node scripts/validate-helm-rate-limit-config.mjs`: focused Helm values and ConfigMap assertions for Redis-backed API rate limiting.
- `pnpm run test:coverage`: unit/component coverage gate.
- `pnpm run test:e2e:coverage`: browser/API e2e coverage.
- `pnpm run quality:presets`: dry-run modern QA presets.
- `pnpm run test:docker-smoke`: Docker stack smoke probes.
- `pnpm run test:fullstack`: fullstack Playwright e2e against Docker Compose.
