# Canonical testing and QA matrix

This repository treats QA as local-first. GitHub Actions can choose a different cadence later, but every preset below is a real command that can be run from a developer workstation or any build runner with the required runtime.

## Local command matrix

| Category | Purpose | Local command | Default gate | Environment / notes |
| --- | --- | --- | --- | --- |
| Formatting | Stable source, config, generated artifacts, and docs formatting | `pnpm run format:check` | Blocking | `pnpm run format` fixes formatting. |
| Unit tests | Pure functions, services, components, and isolated modules | `pnpm run test` | Blocking | Nx project `test` targets. |
| Coverage gates | Enforce test coverage expectations | `pnpm run test:coverage` | Blocking/manual | Runs all test targets with coverage. |
| Integration tests | Multiple modules without the full system | `pnpm run test` | Blocking | Kept inside project test targets. |
| DB component tests | Real PostgreSQL/Testcontainers module coverage | `pnpm run test:component` | Blocking when Docker is available | Requires Docker/Testcontainers. |
| Migration safety | Migration presence, apply/rollback/seed drift checks | `pnpm run db:migrations:check` | Blocking | Runtime migration helpers remain under `packages/tooling/scripts/db`. |
| Backend API e2e | Nest HTTP/API behavior with real request paths | `pnpm run test:e2e` | Blocking/manual | Runs Nx e2e targets for backend and frontend apps. |
| Frontend component/UI | jsdom/RTL/Vitest UI behavior | `pnpm run test` | Blocking | Covered by frontend project test targets. |
| Browser e2e | Real-browser app flows | `pnpm run test:e2e` | Blocking/manual | Project-level browser tests. |
| Cross-browser/mobile e2e | Chromium, Firefox, WebKit, mobile Chrome, mobile Safari | `pnpm run test:e2e:matrix` | Manual/nightly | Uses `playwright.extended.config.ts`; set `PLAYWRIGHT_BASE_URL` to test an existing stack or omit it to let the fullstack setup manage Docker. Set `PLAYWRIGHT_INCLUDE_QUARANTINED=1` to include `@quarantine` specs. Use `-- --dry-run` to print the command. |
| Fullstack e2e | Docker Compose, browser, DB, APIs, nginx/proxy checks | `pnpm run test:fullstack` | Blocking/manual | Requires Docker and Playwright browsers. |
| Docker smoke | Stack boots and probes critical endpoints | `pnpm run test:docker-smoke` | Blocking/manual | Requires Docker. |
| Storybook interaction | Component stories and interactions | `pnpm run test:storybook` | Blocking/manual | Build Storybook first with `pnpm run storybook:build`. |
| Visual regression | Storybook screenshot diffs across desktop/mobile browsers | `pnpm run test:visual` | Manual/nightly | Discovers stories from Storybook `index.json`; set `STORYBOOK_URL` or build Storybook. Configure `VISUAL_PROJECTS`, `VISUAL_STORY_IDS`, `VISUAL_MAX_STORIES`, `VISUAL_MAX_DIFF_PIXEL_RATIO`, `VISUAL_THRESHOLD`. Update baselines with `pnpm run test:visual:update`. |
| OpenAPI contract freshness | Generated OpenAPI JSON drift | `pnpm run api:contracts:check` | Blocking | Contracts live in `contracts/openapi`; `docs/openapi` must not be reintroduced as hand docs. |
| Frontend client freshness | Generated typed clients drift | `pnpm run api:clients:check` | Blocking | Uses committed OpenAPI contracts as inputs. |
| OpenAPI linting | Structural/style contract quality | `pnpm run api:openapi:lint` | Blocking | Native lint validates OpenAPI version, operation IDs, tags, responses, schemas, refs, and security schemes. Optional Spectral: `OPENAPI_LINT_ENGINE=spectral pnpm run api:openapi:lint`. Reports to `test-results/openapi-lint/report.json`. |
| OpenAPI fuzzing | Contract-derived request case generation and safe live probes | `pnpm run api:openapi:fuzz` | Manual/nightly | Always writes generated cases. Set `OPENAPI_FUZZ_BASE_URL` for safe live `GET/HEAD/OPTIONS` probes. Set `OPENAPI_FUZZ_UNSAFE=1` only against disposable systems. Optional Schemathesis: `OPENAPI_FUZZ_ENGINE=schemathesis`. Dry run: `pnpm run api:openapi:fuzz -- --dry-run`. |
| Consumer-driven contracts | Pact-style frontend/backend contract expectations | `pnpm run api:contracts:consumer` | Blocking | Reads `contracts/consumers/*.json` and verifies interactions against `contracts/openapi`. Add new consumers as Pact-compatible JSON fixtures. |
| Accessibility | WCAG-oriented semantic checks plus axe | `pnpm run test:a11y` | Manual/nightly | Set `A11Y_URLS` or build static apps/Storybook. Uses `axe-core` from `node_modules`, `AXE_CORE_PATH`, or cached CDN fetch. Set `A11Y_PROFILES=desktop,mobile`; `A11Y_STRICT_AXE=0` allows semantic-only fallback. Dry run: `pnpm run test:a11y -- --dry-run`. |
| Performance | Page budgets, API p95/load probes, optional Lighthouse | `pnpm run test:perf` | Manual/nightly | Set `PERF_URLS` and/or `PERF_API_URLS`. Budgets: `PERF_TTFB_BUDGET_MS`, `PERF_HTML_BUDGET_BYTES`, `PERF_API_P95_BUDGET_MS`, `PERF_API_REQUESTS`. Optional Lighthouse: `PERF_ENGINE=lighthouse` or `PERF_LIGHTHOUSE=1`. Dry run supported. |
| Security SAST | Lightweight JS/TS static security checks, optional Semgrep | `pnpm run test:security:sast` | Blocking/manual | Native rules flag eval, dynamic Function, disabled TLS, dangerous HTML sinks, shell exec, weak random. Optional Semgrep: `SECURITY_SAST_ENGINE=semgrep`. Dry run supported. |
| Dependency audit | Package vulnerability gate | `pnpm run audit` | Blocking/manual | Uses `pnpm audit --audit-level=moderate`. |
| Secret scanning | Leaked keys/tokens/high-entropy strings | `pnpm run test:security:secrets` | Blocking/manual | Native scan ignores generated/build dirs and placeholders. Optional gitleaks: `SECRET_SCAN_ENGINE=gitleaks`. Dry run supported. |
| Security DAST | Runtime header, reflected payload, 5xx, sensitive path probes | `pnpm run test:security:dast` | Manual/nightly | Set `SECURITY_DAST_URLS`. Required headers default to `x-content-type-options,referrer-policy`; override with `SECURITY_DAST_REQUIRED_HEADERS`. Optional OWASP ZAP: `SECURITY_DAST_ENGINE=zap`. Dry run supported. |
| Security aggregate | SAST + secrets + DAST | `pnpm run test:security` | Manual/nightly | Pass `-- --dry-run` to validate configuration without targets. |
| Property-based invariants | Randomized OpenAPI/schema/path/workspace invariants | `pnpm run test:property` | Blocking | Native randomized checks over contracts, schema examples, path templates, package script references, workspace tooling. Uses `fast-check` automatically if it is present, but does not require lockfile churn. |
| Mutation testing | Mutation score for app/libs source | `pnpm run test:mutation` | Manual/nightly | Uses Stryker via `pnpm dlx @stryker-mutator/core`. Dry run validates config and writes command report. |
| Flake and quarantine | Keep unstable e2e specs out of normal matrix | `pnpm run test:e2e:matrix` | Manual/nightly | Specs tagged `@quarantine` are skipped unless `PLAYWRIGHT_INCLUDE_QUARANTINED=1`. Playwright retries remain enabled in CI. |

## Preset bundles

- Cheap local gate: `pnpm run check`
- Optional preset smoke/dry-run bundle: `pnpm run quality:presets`
- Security suite only: `pnpm run test:security`

`pnpm run check` intentionally stays local and deterministic: formatting, migration/config drift, OpenAPI/client freshness, OpenAPI lint, consumer contracts, OpenAPI fuzz case generation, property invariants, lint, typecheck, and unit tests.

`pnpm run quality:presets` validates all preset entry points while keeping target-dependent suites in dry-run mode. Promote any dry-run preset to a blocking command in a future workflow only after the target environment, artifacts, and runtime budget are stable.

## Contracts as generated artifacts

Generated API contracts are committed under `contracts/openapi`. They are machine-readable inputs for linting, fuzzing, client generation, and consumer contract checks. Do not move them back under `docs/openapi` as hand-authored documentation.

Consumer expectations live under `contracts/consumers` as Pact-style JSON. Each interaction names a provider matching an OpenAPI contract title or filename and validates request/response bodies against the committed provider schema.
