## Evidence Policy

`REQ-ASSURANCE-TRACE-001` remains critical because a false passing trace can
authorize unrelated code. The change therefore requires acceptance, tooling,
documentation, and mutation profiles. Version 3 sidecars replace version 2
atomically because the new required field is a breaking evidence contract.

## Requirement Evidence

| Requirement               | Risk     | Required evidence                            | Repository owners                                                                                                                     |
| ------------------------- | -------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `REQ-ASSURANCE-TRACE-001` | critical | acceptance, tooling, documentation, mutation | `@repo/tooling:packages/tooling/src/commands/spec/assurance.test.ts`; `acceptance-e2e:apps/e2e/acceptance/features/assurance.feature` |

The tooling tests will cover:

- a complete acceptance disposition;
- a complete not-applicable disposition;
- missing disposition;
- acceptance without profile or Cucumber evidence;
- not-applicable with acceptance profile or Cucumber evidence;
- missing, placeholder, Cucumber, duplicate, or unmapped alternatives;
- complete trace totals across all 58 migrated requirements.

The existing executable test marker on the tooling suite remains
`// @requirements REQ-ASSURANCE-TRACE-001`. No new test owner is introduced.

## Independence Review

The validator checks metadata independently from the Cucumber runner and from
the evidence commands it references. Schema validation challenges document
shape; semantic unit tests challenge cross-field meaning; the acceptance
scenario challenges stakeholder-visible trace behavior; strict OpenSpec and
documentation gates challenge the durable contract.

Quality-engineering remains distinct from repository-maintainers for the
critical requirement. Human review must evaluate whether all 53 rationales are
requirement-specific; passing structure alone cannot prove their quality.

## PR, Main, Nightly, and Runtime Lanes

- PR: strict OpenSpec, tooling typecheck/tests/static-check, acceptance Cucumber,
  docs, specification validation, and exact-SHA requirement verification.
- Main: the same deterministic contract plus normal main evidence.
- Nightly: existing mutation evidence continues to challenge the assurance
  validator.
- Runtime: no new runtime behavior; existing runtime evidence remains selected
  only by its owning requirements.

A required skip remains non-passing.

## Residual Risk

- Human reviewers can still approve an unhelpful but structurally valid
  rationale; tailored migration text and independent review reduce this risk.
- Explicit disposition cannot prove that an unknown stakeholder scenario was
  discovered.

## Independent Verification Reviewer

- quality-engineering, with repository-maintainer approval and existing
  security/release CODEOWNER review where required.
