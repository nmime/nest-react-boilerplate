# Test reliability runbook

This guide covers practices for writing deterministic, reliable tests.
See the [modern QA matrix](testing/modern-qa.md) for the full test category inventory and gate definitions.

## Deterministic time

Tests that depend on the current time must use a controlled clock:

```ts
// Use `useFakeTimers` in Jest/Mocha
jest.useFakeTimers().setSystemTime(new Date("2025-01-01T00:00:00Z"));
// ... assertions ...
jest.useRealTimers();
```

Or inject a time provider:

```ts
const timeProvider = () => new Date("2025-01-01T00:00:00Z");
// Pass timeProvider to services that read Date.now()
```

Never call `new Date()` or `Date.now()` directly in tested code when the result affects assertions.

## Seed factories and deterministic data

Use seed factories for test data generation:

- **Database seeds:** `pnpm db:seed -- --dry-run` validates without writing. Seeds are idempotent.
- **Test fixtures:** use fixed seed values in factories to ensure reproducible data across runs.
- **Property-based tests:** `pnpm run test:property` uses seeded generators for reproducibility.

When debugging a failing property test, the failure output includes the seed — re-run with that seed to reproduce.

## Quarantining flaky tests

Tests tagged `@quarantine` are excluded from normal CI runs:

```ts
// playwright test
test.describe("@quarantine flaky feature", () => {
  test("flaky scenario", async ({ page }) => {
    // ...
  });
});
```

To run quarantined tests:

```bash
PLAYWRIGHT_INCLUDE_QUARANTINED=1 pnpm run test:e2e:matrix
```

**Quarantining is a backlog mechanism.** Quarantined tests should be fixed or removed — they are not a permanent solution.
Track quarantined tests in the issue tracker with the `flaky-test` label.

## CI commands

| Command                      | Purpose                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm run check`             | Full local deterministic gate (format, lint, typecheck, contracts, property, unit) |
| `pnpm run check:fast`        | Fast PR gate (format, lint, typecheck, unit)                                       |
| `pnpm run test`              | Unit tests (Jest)                                                                  |
| `pnpm run test:property`     | Property-based tests                                                               |
| `pnpm run test:coverage`     | Unit tests with coverage report                                                    |
| `pnpm run test:component`    | Component-level tests                                                              |
| `pnpm run test:e2e`          | Playwright end-to-end (Chromium)                                                   |
| `pnpm run test:e2e:matrix`   | Cross-browser e2e matrix                                                           |
| `pnpm run test:docker-smoke` | Docker stack smoke tests                                                           |
| `pnpm run test:fullstack`    | Fullstack Playwright e2e                                                           |
| `pnpm run test:world-class`  | Runtime QA/ops gates (requires runtime)                                            |

## Investigating CI test failures

1. **Check if the failure is reproducible locally:**
   ```bash
   pnpm install --frozen-lockfile
   pnpm run test -- --testNamePattern="<failing test name>"
   ```
2. **Time-sensitive failures:** add `console.log(Date.now())` to confirm timing issues; switch to fake timers.
3. **Race conditions:** check for unhandled promises, missing `await`, or shared mutable state across tests.
4. **Environment-dependent failures:** ensure tests don't depend on local environment state (file system, network, env vars).
5. **Quarantine if intermittently failing:** tag `@quarantine` and file an issue, then fix within the current sprint.
