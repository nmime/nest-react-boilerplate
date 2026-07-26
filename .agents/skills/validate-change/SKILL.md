---
name: validate-change
description: Choose and run proportional repository validation using the Testing Trophy. Use after implementation, before handoff, or when deciding targeted versus broad lint, typecheck, test, build, browser, Docker, and generated-artifact checks.
---

# Validate a repository change

## Read first

- Read `../../../docs/command-matrix.md`, `../../../docs/local-verification.md`,
  `../../../docs/testing.md`, and project targets for every changed owner.

## Build the validation map

1. Classify the diff: docs, tooling, generator, shared alias, backend, frontend,
   native, database, API contract, infrastructure, or cross-cutting.
2. Start with the narrowest test that can falsify the change, then broaden
   according to consumers and public boundaries.
3. Use `../validate-frontend-quality/SKILL.md` when the changed risk includes
   browser UI, responsive behavior, Storybook, accessibility, SSR, or native UI.
4. Use `../validate-backend-quality/SKILL.md` when the changed risk includes API,
   persistence, messaging, consumers, schedulers, backend-common, or runtime infrastructure.

## Required principles

- Favor static checks and focused unit/component tests for fast feedback.
- Use integration tests for persistence, messaging, framework composition, and generated contracts.
- Use browser or mobile e2e for critical user journeys; use browser-mode Storybook for component portal, focus, and accessibility behavior.
- Run Docker/Testcontainers checks when the changed contract depends on real infrastructure. A missing Docker engine is an unverified lane, not a pass.
- Regenerate source-derived artifacts only from their canonical source and inspect the diff.
- Always run `git diff --check`. Run `pnpm run agent:verify` when agent guidance, setup, generators, or ownership rules change.

## Specification assurance

For behavior-changing diffs, include
`$review-specification-assurance` in the independent review so requirement
completeness, ownership, evidence meaning, and exact-SHA provenance are checked.

## Report

List each command and outcome, distinguish code failures from environment blockers, and state the exact unverified boundary. Never update baselines, snapshots, or golden files merely to silence a failure.
