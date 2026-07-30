# Acceptance E2e

Cucumber.js executable acceptance specifications for repository capabilities.

Run:

```bash
pnpm exec nx run acceptance-e2e:acceptance
```

Feature files own stakeholder-readable examples. OpenSpec owns normative
requirements, while Vitest, contracts, property tests, Playwright, and runtime
checks remain independent evidence lanes.

The Nx `test` target deliberately does not forward repository-wide runner
arguments such as Vitest's `--coverage`; it still executes every Cucumber
scenario and writes the message, HTML, and JUnit evidence. Use the `acceptance`
target when passing Cucumber-owned CLI options.
