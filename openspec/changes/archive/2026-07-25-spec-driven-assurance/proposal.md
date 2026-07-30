## Why

The repository has strong individual test suites, but no executable contract
that proves every owned project and stakeholder requirement is represented by
fresh evidence from the same source revision. Coverage alone cannot reveal
omitted requirements, stale tests, or a release that moved beyond tested code.

## What Changes

- Add durable OpenSpec capability specifications and stable requirement IDs.
- Add Cucumber.js executable acceptance examples without replacing Vitest,
  Playwright, contract, property, component, security, or operations tests.
- Add evidence manifests, ownership validation, impact analysis, exact-SHA
  verification dossiers, and PR/main/nightly/runtime lanes.
- Add an Nx Cucumber application kind to repository generators and setup
  catalogues.
- Make mutation execution opt-out only through explicit dry-run.
- Require successful exact-revision CI before release and remove release-time
  source commits.

## Goals and Non-Goals

**Goals:**

- Detect unmapped projects, requirements, features, scenarios, and evidence.
- Keep requirements, examples, implementation evidence, and release provenance
  mechanically synchronized.
- Give reviewers compact trace and evidence reports instead of requiring a full
  source-code reread for every change.

**Non-Goals:**

- Claim that tests can prove the original human requirement is correct.
- Replace exploratory testing, threat modelling, production canaries, or human
  product approval.
- Translate every unit test into Gherkin.

## Capabilities

### New Capabilities

- `repository-assurance`: traceability, evidence freshness, and release provenance.
- `authentication-access`: fail-closed identity, session, tenant, and RBAC behavior.
- `api-contracts`: RFC 9457 and provider/consumer contract synchronization.
- `notification-delivery`: delivery and broadcast lifecycle invariants.
- `frontend-experience`: renderer journeys, accessibility, design, and locale contracts.
- `runtime-operations`: health, dependency lifecycle, resilience, and recovery.
- `social-integrations`: Telegram and Discord ingress and session isolation.
- `workspace-scaffolding`: repeatable owned generation and setup selection.

### Modified Capabilities

- None; this migration establishes the repository's first durable capability baseline.

## Impact

The change touches root dependencies and commands, repository tooling, Nx
generators, setup presets, GitHub CI/release workflows, acceptance tests,
selected evidence source annotations, and repository documentation.

## Risk, Rollout, and Rollback

Risk is high because the change affects merge and release gates. Rollout is
incremental by evidence lane: structural and focused evidence on PRs, broader
evidence on main, mutation/component/operational suites nightly, and
environment-bound journeys at runtime. Rollback removes the new CI calls and
commands while preserving the durable specs; release provenance hardening
should not be rolled back unless replaced by an equivalent exact-SHA gate.
