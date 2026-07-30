## Context

The current assurance graph validates durable requirements, evidence files,
Cucumber tags, execution commands, exact-SHA reports, and capability ownership
for all Nx projects. Its sidecar schema places `projects` at capability level,
while only explicit high-signal evidence files must name a requirement. The
result is structurally valid but too coarse: 447 executable test files exist and
only 21 currently name a durable requirement.

This migration is repository-wide but metadata-only for product runtime. It must
remain deterministic, offline-capable, compatible with the existing Nx graph,
and strict enough that future projects, tests, skills, or examples cannot drift
outside the model.

## Goals / Non-Goals

**Goals:**

- Make requirement ownership precise enough for impact selection.
- Trace all current executable tests without duplicating their assertions in
  OpenSpec or Gherkin.
- Expose honest inventory totals in machine and human assurance reports.
- Give agents an executable specification lifecycle and enforce its discovery.
- Preserve the existing exact-SHA and lane model.

**Non-Goals:**

- Change runtime product behavior.
- Treat a requirement annotation as sufficient evidence by itself.
- Replace independently selected high-signal evidence with the complete test
  inventory.
- Infer missing product requirements from source code.

## Decisions

### Verification sidecars use schema version 2

Move `projects` from the sidecar root to each requirement:

```yaml
version: 2
capability: authentication-access
owners:
  product: identity-maintainers
  verification: quality-engineering
requirements:
  - id: REQ-AUTH-CREDENTIAL-003
    projects: [auth-app-api, '@app/backend-feature-auth-main']
    risk: critical
    profiles: [domain, security]
    evidence: [...]
```

The union of requirement project lists must cover every discovered Nx project.
This makes changed-project impact selection precise and prevents a generic
capability membership from implying behavioral ownership.

Alternative rejected: keep both capability and requirement project lists.
Duplicated ownership would require another synchronization rule while providing
no additional source of truth.

### Complete test inventory is separate from high-signal evidence

The validator scans repository-owned roots (`apps`, `libs`, `packages`, `i18n`,
`scripts`, `deploy`, `docker`, and `.github`) for TypeScript/JavaScript files
whose basename ends in `spec` or `test`. Each file must contain at least one
known `REQ-*` identifier.

For files inside an Nx project, at least one named requirement must own that
project. Repository-level script tests outside project roots must name a known
requirement and remain covered by an explicit high-signal evidence command where
their behavior is release-significant.

Inventory annotations establish traceability only. The existing evidence arrays
continue to select independent Cucumber, Vitest, Playwright, contract, property,
component, mutation, security, operations, static, and documentation evidence.

Alternative rejected: add every test file as an evidence entry. Hundreds of
sidecar entries would make the specification harder to review and would confuse
test inventory with deliberately selected independent evidence.

### Inventory totals become first-class assurance output

Add executable test totals and Cucumber feature/scenario totals to trace and
verification reports:

- discovered/traced projects;
- discovered/traced executable tests;
- features and stable scenarios;
- requirements and high-signal evidence references.

Validation remains binary: any untraced executable test is an error, so a green
report always shows equal discovered and traced test totals.

### Existing tests receive semantic project-level annotations

Assign each test file to a durable requirement based on its owning project and
the behavior expressed by its path/name. Large owners such as auth persistence,
notification application services, frontend UI, and repository tooling use
several requirements rather than one generic catch-all. A deterministic
migration script may perform the mechanical insertion, but the checked-in
requirement map and validator are the durable controls.

### Three skills own the lifecycle

- `$specify-behavior`: discovery, examples/counterexamples, durable requirement,
  risk, owners, and evidence planning.
- `$implement-specified-change`: implementation from approved requirements,
  synchronized test annotations and sidecars, impacted evidence, and dossier.
- `$review-specification-assurance`: adversarial completeness, independence,
  omission, lane, and exact-SHA review.

Behavior-changing planning/development/contract/migration skills route through
the first two; quality, review, and audit skills route through the third.
Agent-skill validation enforces the routing for a canonical set of behavior
skills so documentation drift cannot silently remove it.

### Cucumber remains selective

The existing five stakeholder-facing feature files remain the acceptance
surface. New durable requirements receive Gherkin only when a stakeholder-
significant example benefits from shared language. Unit matrices and mechanical
repository rules remain in their owning runners.

## Risks / Trade-offs

- **Risk: shallow annotations satisfy syntax** → Require project ownership,
  expand the durable requirements by real responsibility, and review large
  project mappings separately.
- **Risk: large mechanical diff obscures mistakes** → Generate only comment
  insertions, validate all IDs/owners, inspect mapping summaries, and keep
  runtime source unchanged.
- **Risk: test filename conventions miss an executable file** → Cover the
  repository's current `spec`/`test` conventions in unit fixtures and report the
  inventory count.
- **Risk: one test legitimately crosses requirements** → Allow multiple known
  IDs when at least one owns the test's project.
- **Risk: strict validation blocks scaffold canaries** → Generated temporary
  canaries run their local targets; permanent checked-in ownership remains
  incomplete until a durable requirement is added, which is intentional.
- **Trade-off: 100% traceability is not 100% requirement completeness** → Keep
  the truth boundary explicit and retain discovery, property, mutation,
  exploratory, runtime, and incident feedback.

## Migration Plan

1. Add schema-v2 parsing, requirement project ownership, inventory scanning,
   report totals, and regression fixtures.
2. Expand and archive the eight durable capability specifications.
3. Rewrite all verification sidecars to requirement-level project scopes.
4. Annotate all 447 executable test files and validate semantic ownership.
5. Create, register, and validate the three lifecycle skills; route existing
   behavior skills through them.
6. Update policy, workflow, command, and assurance documentation.
7. Run strict OpenSpec, skill, tooling, project, full local, and hosted exact-SHA
   gates.

Rollback reverts the metadata/schema migration together. No runtime or database
rollback is required.

## Open Questions

None.
