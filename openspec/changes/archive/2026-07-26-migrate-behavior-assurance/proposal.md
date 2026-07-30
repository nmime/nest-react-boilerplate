## Why

The first assurance migration assigns all 90 Nx projects to eight capabilities,
but only 21 of 447 executable test files name a durable requirement. Capability-
level ownership therefore makes behavioral coverage look more complete than it
is and leaves most tests, skills, and future changes outside the synchronized
specification workflow.

## What Changes

- Move project ownership from a capability-wide list to the individual
  requirements that actually govern each project.
- Expand durable requirements to cover nearly all product, platform, tooling,
  delivery, and failure behavior already exercised by the repository.
- Require every executable test file and Cucumber scenario to name at least one
  valid durable requirement, with no unknown or cross-owner identifiers.
- Report test-inventory coverage alongside project, requirement, and evidence
  totals.
- Add repo-local skills for specifying behavior, implementing approved
  specifications, and independently reviewing assurance.
- Route behavior-changing skills through the new lifecycle and mechanically
  validate that routing.
- Keep exact-SHA CI, mutation, property, browser, component, security, and
  runtime evidence fail-closed.

## Goals and Non-Goals

**Goals:**

- Trace all 447 current executable test files and all five Gherkin features.
- Give every discovered Nx project requirement-level ownership.
- Make a new untraced test, project, behavior skill, or Cucumber scenario fail
  the fast specification gate.
- Preserve readable requirements and high-signal evidence without copying every
  implementation assertion into OpenSpec or Gherkin.
- Provide concise skills that make the workflow repeatable for future agents.

**Non-Goals:**

- Claim mathematical proof that the product requirements are complete or
  correct.
- Convert every unit-test assertion into a Gherkin scenario.
- Generate behavioral requirements from implementation code.
- Require production-only canaries to pass in a local or pull-request lane.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `repository-assurance`: add exhaustive executable-test inventory and
  specification-skill enforcement.
- `authentication-access`: cover credential, tenant, RBAC, identity, profile,
  audit, and persistence behavior already present in auth/user/admin projects.
- `api-contracts`: cover request context, validation, response serialization,
  browser API support, and client generation boundaries.
- `notification-delivery`: cover templates, audiences, encryption, scheduling,
  retries, feature flags, and user preference behavior.
- `frontend-experience`: cover each renderer, product shell, shared web/native
  UI, API error UX, accessibility, responsive behavior, and localization.
- `runtime-operations`: cover configuration, bootstrap lifecycle, health,
  observability, Redis, NATS, S3, PostgreSQL, static delivery, WebSockets,
  recovery, and deployment validation.
- `social-integrations`: cover Telegram/Discord ingress, polling, commands,
  sessions, localization, and configuration.
- `workspace-scaffolding`: cover application/library/feature generators, setup,
  initialization, safe repository tooling, QA commands, and agent workflows.

## Impact

- All durable OpenSpec specifications and verification sidecars.
- `packages/tooling/src/commands/spec/**` and its JSON Schema/tests.
- All executable test files under repository-owned application, library,
  tooling, script, deployment, Docker, and workflow roots.
- Repo-local skills, skill validation, workflow routing, agent documentation,
  and root policy.
- PR/main/nightly/runtime assurance reports and CI summary inputs.

## Risk, Rollout, and Rollback

The primary compatibility risk is making `spec:validate` stricter before the
repository is fully annotated. The migration is atomic: update schema, durable
requirements, manifests, test annotations, skills, docs, and validators in the
same branch, then run the complete local and hosted gauntlet. No runtime API,
database, or user-facing behavior changes.

Rollback reverts this change as one repository commit series. Existing test
commands remain valid throughout; only the assurance metadata and enforcement
are stricter.
