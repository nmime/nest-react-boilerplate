# E2E App Instructions

Follow the root [AGENTS.md](../../AGENTS.md) and detailed
[AI agent policy](../../docs/ai/agent-policy.md). This file applies to `apps/e2e/**`.

## E2E Rules

- Keep e2e projects focused on cross-app and full-stack verification.
- OpenSpec owns normative requirements. Cucumber feature files own selected
  stakeholder examples; keep `@REQ-*` and unique `@SCN-*` tags synchronized
  through each capability `verification.yaml`.
- Keep Gherkin declarative and World state isolated per scenario. Do not
  translate low-level Vitest cases into feature files.
- Do not put reusable product logic, runtime helpers, or fixtures here when a
  library should own them.
- Prefer commands from [Command matrix](../../docs/command-matrix.md) and
  document new e2e coverage in [Testing](../../docs/testing.md).
- Use `$validate-frontend-quality` for browser/native product journeys,
  `$validate-backend-quality` for API/process/infrastructure behavior, and
  `$validate-change` for fullstack or cross-runtime evidence.
