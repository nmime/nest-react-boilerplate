## Why

The assurance graph currently proves that declared Cucumber evidence maps to a
real requirement, but absence of Cucumber is implicit. Reviewers cannot
mechanically distinguish an intentionally non-Gherkin requirement from an
omitted stakeholder example.

## What Changes

- Require every durable requirement to declare an explicit Cucumber
  disposition.
- Make `acceptance` require the acceptance profile and mapped Cucumber
  evidence.
- Make `not-applicable` require a concrete rationale and at least one
  alternative evidence kind that exists on the same requirement.
- Report complete disposition totals and reject missing, contradictory, or
  unsubstantiated declarations.
- Migrate every requirement in all eight version 2 verification sidecars.

## Goals and Non-Goals

**Goals:**

- Make Cucumber omission review complete and machine-checkable.
- Preserve Cucumber for stakeholder-significant examples.
- Prove that every non-Cucumber requirement has an explicit reason and real
  alternative evidence.
- Keep the disposition synchronized with profiles, files, targets, lanes, and
  exact-SHA dossiers.

**Non-Goals:**

- Duplicating every Vitest assertion or OpenSpec scenario in Gherkin.
- Treating a rationale as proof that humans discovered every product scenario.
- Changing product runtime behavior, public APIs, persistence, or deployment.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `repository-assurance`: require complete, explicit, and internally consistent
  Cucumber disposition for every durable requirement.

## Impact

- `packages/tooling/config/spec-evidence.schema.json`
- specification validation, trace reporting, and tooling regression tests
- all eight `openspec/specs/*/verification.yaml` sidecars
- repository assurance specification, documentation, and lifecycle skills
- PR, main, nightly, and runtime evidence selection

No dependency, API, database, or runtime service changes are introduced.

## Risk, Rollout, and Rollback

The main compatibility risk is intentionally fail-closed: old or partially
migrated sidecars will fail validation until every requirement has a
disposition. Rollout is atomic in one source revision with schema, validator,
tests, sidecars, and documentation. Rollback is metadata/tooling-only and can
revert the change without data migration or runtime cleanup.
