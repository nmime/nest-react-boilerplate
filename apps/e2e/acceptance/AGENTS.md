# Acceptance E2e E2E instructions

Follow the repository root `AGENTS.md` and `apps/e2e/AGENTS.md`.

- Keep Gherkin declarative and in product-domain language.
- Give every Rule a stable requirement tag and every Scenario a stable scenario tag.
- Keep World state isolated per scenario and organize step definitions by domain.
- Do not replace Vitest, contract tests, property tests, or Playwright journeys with Cucumber.
