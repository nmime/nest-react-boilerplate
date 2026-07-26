## Participants and Owners

- Product/domain owner: repository-maintainers; approval remains required.
- Specification author: implementation author for this change.
- Independent verification reviewer: quality-engineering; review remains
  required before merge.
- Security reviewer, when applicable: security-maintainers for fail-closed
  validation.
- Operations reviewer, when applicable: release-engineering for exact-SHA and
  lane behavior.

## Actors and Outcomes

- Maintainers need to tell whether missing Cucumber evidence is deliberate or
  accidental without reading every test.
- Product and verification reviewers need stakeholder examples to remain
  selective and readable.
- Agents need one unambiguous field that determines whether to add Gherkin or
  justify another evidence layer.
- CI needs deterministic failures for incomplete or contradictory
  dispositions.

## Rules

- Every durable requirement declares exactly one Cucumber disposition:
  `acceptance` or `not-applicable`.
- `acceptance` requires the acceptance evidence profile and at least one mapped
  Cucumber scenario.
- `not-applicable` forbids the acceptance profile and Cucumber evidence.
- `not-applicable` includes a non-empty, requirement-specific reason.
- `not-applicable` names at least one non-Cucumber alternative evidence kind.
- Every named alternative kind exists in that requirement's evidence list.
- Disposition totals appear in the deterministic trace report.
- Assurance infrastructure changes conservatively select all requirements.

## Examples

- A public authorization rule marked `acceptance` has a `@REQ-*` feature tag,
  a stable `@SCN-*` scenario, and an acceptance-profile Cucumber evidence entry.
- A persistence transaction invariant marked `not-applicable` explains that it
  is an infrastructure boundary and names component evidence already mapped to
  the requirement.
- A frontend journey may be `not-applicable` for Gherkin when Playwright is the
  more faithful executable boundary, provided the sidecar explicitly says so
  and names Playwright evidence.

## Counterexamples and Boundaries

- Missing disposition is invalid even when other evidence exists.
- `acceptance` without the acceptance profile or Cucumber evidence is invalid.
- `not-applicable` with an acceptance profile or Cucumber evidence is
  contradictory and invalid.
- A generic reason such as `not needed` is insufficient.
- Naming Vitest as an alternative when the requirement has no Vitest evidence
  is invalid.
- Cucumber cannot be listed as alternative evidence for `not-applicable`.
- The disposition does not assert that stakeholder discovery was complete.

## Failure and Operational Modes

- Schema or semantic validation fails with the sidecar path and requirement ID.
- A partial migration cannot produce a passing trace or exact-SHA dossier.
- No runtime service or persistent data changes; rollback reverts schema,
  sidecars, validator, and documentation together.
- PR, main, nightly, and runtime evidence semantics remain unchanged except
  that invalid disposition metadata blocks selection.

## Assumptions

- Evidence kinds are the stable vocabulary for alternative layers.
- One or more representative alternative kinds are sufficient; the field does
  not need to repeat every mapped evidence reference.
- Existing five acceptance-profile requirements remain acceptance examples.

## Unresolved Questions

- None. The user explicitly requires complete disposition coverage across the
  whole requirement stack.
