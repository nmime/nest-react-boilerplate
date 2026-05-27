# Modern QA and testing matrix

| Layer | Command | CI cadence | Notes |
| --- | --- | --- | --- |
| Formatting | `pnpm run format:check` | PR | Prettier over source, generated artifacts, docs, and config. |
| OpenAPI contract freshness | `pnpm api:contracts:check` | PR | Regenerates committed contracts in `contracts/openapi`. |
| OpenAPI lint | `pnpm api:openapi:lint` | PR/nightly | Dependency-free contract lint for operation IDs, tags, responses, refs, and security schemes. |
| OpenAPI fuzz | `pnpm api:openapi:fuzz` | Nightly/manual | Dry report by default; set `OPENAPI_FUZZ_BASE_URL` for safe live-method probes. |
| Frontend client freshness | `pnpm api:clients:check` | PR | Regenerates `@app/api-client` from committed contracts and checks drift. |
| Unit and coverage | `pnpm run test` / `pnpm run test:coverage` | PR | Vitest with coverage gates. |
| Backend Testcontainers components | `pnpm run test:component` | PR | PostgreSQL-backed module/controller/service coverage. |
| Static/browser frontend e2e | `pnpm run test:e2e` / `pnpm run test:e2e:coverage` | PR | Vite build plus Playwright coverage smoke. |
| Storybook interactions | `pnpm run test:storybook` | PR | Storybook test-runner against the static Storybook build. |
| Storybook visual regression | `pnpm run test:visual` | PR | Playwright screenshots checked against `packages/tooling/baselines/visual`. |
| Accessibility | `pnpm run test:a11y` | Nightly/manual | Playwright semantic checks; injects axe-core automatically if present. Use `-- --dry-run` for cheap preset validation. |
| Cross-browser/mobile e2e | `pnpm run test:e2e:matrix` | Nightly/manual | Chromium, Firefox, WebKit, mobile Chrome, and mobile Safari via `playwright.extended.config.ts`. |
| Docker smoke | `pnpm run test:docker-smoke` | PR | Builds/starts the compose stack and probes APIs/frontends/proxies. |
| Fullstack Playwright | `pnpm run test:fullstack` | PR/nightly | Docker Compose, real Postgres, APIs, nginx, and browser assertions. |
| Performance | `pnpm run test:perf` | Nightly/manual | Dry-run unless `PERF_URLS` is set; writes `test-results/performance/report.json`. |
| Security DAST | `pnpm run test:security:dast` | Nightly/manual | Dry-run unless `SECURITY_DAST_URLS` is set; checks basic headers and 5xx failures. |
| Mutation | `pnpm run test:mutation` | Nightly/manual | Uses `pnpm dlx @stryker-mutator/core run stryker.config.mjs` to avoid lockfile churn. |
| Property invariants | `pnpm run test:property` | PR | Dependency-free checks for OpenAPI refs, workspace globs, and local script paths. |

`pnpm run quality:presets` runs cheap blocking checks plus dry-runs for expensive presets. Promote a dry-run preset to blocking when the target environment is stable, artifacts are actionable, and runtime is acceptable for the workflow tier.
