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
that satisfies each risk profile.

Run heavier suites intentionally: `test:component`, `test:e2e`, `test:storybook`, `test:visual`, `test:docker-smoke`, `test:fullstack`, and the nightly/manual presets (`api:openapi:fuzz`, `test:a11y`, `test:e2e:matrix`, `test:perf`, `test:security:dast`, `test:mutation`).

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
