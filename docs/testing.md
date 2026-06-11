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

## Design-system and frontend tooling

- `pnpm run storybook` serves the shared design-system Storybook from `libs/frontend/ui/lib/.storybook`.
- `pnpm run storybook:build` writes the static Storybook artifact to `dist/storybook/frontend-ui`; `pnpm run test:storybook` builds/serves that config and runs `test-storybook`.
- `pnpm run frontend:fsd:check` enforces frontend FSD layer tags, slice boundaries, and public API usage across `apps/frontend/**` and `libs/frontend/**`.
- Frontend app e2e targets use Vite builds with `VITE_E2E_COVERAGE=true` and the `frontend-browser-e2e-coverage` smoke helper; update the app `project.json` copy assertions when shell copy changes.
