## Participants and Owners

- Product/domain owner: repository maintainer requesting near-complete migration
- Specification author: repository maintainers
- Independent verification reviewer: quality engineering
- Security reviewer, when applicable: security maintainers
- Operations reviewer, when applicable: release and platform engineering

## Actors and Outcomes

- Maintainers need to review concise intent, risks, and proof without reading
  thousands of test and implementation lines.
- Product and domain owners need durable requirements that survive refactors.
- Implementers need an unambiguous path from approved behavior to code and
  proportionate evidence.
- Verification reviewers need an independently inspectable graph from
  requirement to project, test inventory, evidence command, lane, and source SHA.
- Release engineering needs assurance results that cannot authorize another
  revision or silently omit a required lane.

## Rules

- Requirement-level project ownership is authoritative; capability-wide project
  lists are too coarse for impact selection or completeness claims.
- Every repository-owned executable test file must explicitly name at least one
  existing durable requirement.
- A test inside an Nx project must name a requirement that owns that project.
- Every Cucumber scenario keeps one stable scenario ID and a durable requirement
  tag, with explicit evidence mapping.
- OpenSpec requirements remain readable behavioral contracts; test annotations
  link evidence but do not turn implementation details into normative behavior.
- Critical and high-risk behavior keeps independent verification ownership.
- New behavior starts in specification discovery unless the change is provably
  non-behavioral, such as formatting or a source-preserving refactor.
- A new project, test, scenario, or behavior-changing skill that lacks assurance
  ownership fails the fast validation gate.
- Passing evidence is bound to the exact clean source revision and lane.

## Examples

- A new authentication guard updates the auth requirement or adds a new one,
  names that ID in its Vitest failure matrix, maps the owning API/library
  projects, and runs the impacted PR evidence.
- A new Cucumber example carries `@REQ-*` and a unique `@SCN-*`; the sidecar
  points to the feature, scenario, acceptance target, and lanes.
- A generated library with a test target is not considered complete until an
  owning requirement and test annotation are added.
- A repository tooling test can map to a tooling or assurance requirement even
  when the behavior is not user-facing.

## Counterexamples and Boundaries

- Merely placing a project in a capability does not prove any of its behavior.
- Line coverage without a requirement link does not count as specification
  migration.
- Adding one generic requirement to every test would satisfy syntax but fail
  semantic ownership review; requirements are grouped by actual product,
  runtime, or tooling responsibility.
- Gherkin is reserved for stakeholder-significant examples; pure algorithms,
  exhaustive failure matrices, and generated-client compatibility remain in
  Vitest, property, or contract suites.
- Type declarations, fixtures, snapshots, generated output, and configuration
  files that are not executable test entries are not annotated as tests.
- Production-only canaries remain runtime evidence and cannot be converted into
  a pull-request pass.

## Failure and Operational Modes

- Unknown requirement IDs, unowned project references, untraced test files,
  duplicate scenario IDs, missing evidence commands, or schema drift fail
  `spec:validate` with the exact file or owner.
- A dirty worktree cannot produce a passing exact-SHA dossier.
- An unavailable required runtime lane reports an environment blocker and
  prevents readiness; it is never changed to a successful skip.
- The migration must not change runtime APIs, persistence, secrets, or
  deployment state.
- Rollback reverts the schema, annotations, skills, and docs together; existing
  underlying test runners remain independently executable.

## Assumptions

- The checked-in executable tests represent nearly all currently declared
  behavior, while undocumented and unknown requirements still require human
  discovery.
- Nx project roots and root scripts remain the canonical execution ownership
  model.
- Multiple tests may name the same durable requirement, and one integration test
  may legitimately name several requirements.
- Repository scripts outside Nx project roots may name any durable requirement
  whose verification sidecar maps that script as evidence.

## Unresolved Questions

- None.
