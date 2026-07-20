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

Run heavier suites intentionally: `test:component`, `test:e2e`, `test:storybook`, `test:visual`, `test:docker-smoke`, `test:fullstack`, and the nightly/manual presets (`api:openapi:fuzz`, `test:a11y`, `test:e2e:matrix`, `test:perf`, `test:security:dast`, `test:mutation`).

## Reliability

For deterministic testing practices (fake timers, seed factories, quarantining), see [test reliability runbook](testing/test-reliability.md).

## Design-system and frontend tooling

- `pnpm run storybook` serves `@app/frontend-ui-web` stories from `libs/frontend/ui-web/lib/.storybook`.
- `pnpm run storybook:build` writes the static Storybook artifact to `dist/storybook/frontend-ui-web`; `pnpm run test:storybook` builds/serves that config and runs `test-storybook`.
- `pnpm run frontend:fsd:check` enforces frontend FSD layer tags, slice boundaries, and public API usage across `apps/frontend/**` and `libs/frontend/**`.
- `admin-app` and `user-app` e2e targets use Vite builds with
  `VITE_E2E_COVERAGE=true` plus the `frontend-browser-e2e-coverage` helper;
  update their `project.json` copy assertions when shell copy changes.
- `landing-app`, `site-app`, and `mobile-app` use renderer-specific Astro build,
  Vike SSR build, and Expo web-export smoke scripts. Those targets prove
  build/runtime artifacts but do not claim the Vite browser coverage contract.
