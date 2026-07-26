## Participants and Owners

- Product/domain owner: capability maintainers
- Specification author: repository maintainers
- Independent verification reviewer: quality engineering
- Security reviewer, when applicable: security maintainers
- Operations reviewer, when applicable: platform and release engineering

## Actors and Outcomes

- Product owners can review requirements and examples without reading all code.
- Implementers can calculate impacted requirements and required gates.
- Verification owners can see missing or stale evidence.
- Release operators can prove that published artifacts came from successful CI.
- Agents receive constraints that fail closed when ownership or evidence is absent.

## Rules

- OpenSpec owns normative requirements; Gherkin owns selected stakeholder examples.
- Every requirement has a stable ID, risk, owners, profiles, and explicit evidence.
- Every Nx project belongs to at least one capability.
- Every feature and scenario has stable requirement/scenario tags.
- Evidence reports bind source SHA and specification hash.
- A skipped required gate is not a pass.
- Generated tests and line coverage are supporting signals, not sufficient evidence.

## Examples

- A DTO change impacts the API requirement and selects contract and tooling gates.
- A malformed role claim executes a declarative Cucumber example and independent
  Vitest/security evidence.
- A mutation run executes on the nightly lane and records surviving mutants.
- Release checks out the successful CI workflow SHA and confirms it is current main.

## Counterexamples and Boundaries

- A passing test with no requirement reference is untraceable evidence.
- A requirement with generated tests only is insufficient.
- A green report from a previous commit is stale.
- Cucumber is not used for low-level algorithms already clearer in Vitest.
- Runtime browser/provider checks cannot be represented as locally passed when
  their environment was unavailable.

## Failure and Operational Modes

- Missing mappings fail `spec:validate` before broader implementation gates.
- Evidence commands retain failures and bounded output in the dossier.
- Nightly/runtime environment failures remain distinguishable from source failures.
- Release provenance mismatch stops before publishing.
- Reverting gate integration does not delete specifications or historical evidence.

## Assumptions

- GitHub branch governance can require the final CI summary check.
- Maintainer groups named in evidence manifests are resolved through CODEOWNERS
  or repository governance outside the manifest.
- Runtime environments provide their own credentials and are never embedded in specs.

## Unresolved Questions

- None.
