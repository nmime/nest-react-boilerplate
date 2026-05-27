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
