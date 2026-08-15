# ADR 0008: OpenSpec/Cucumber specification-assurance graph

- Status: Accepted
- Date: 2026-08-04
- Owners: @nmime

## Context

With tens of projects and hundreds of test files, reviewing intent by reading
implementation and tests alone does not scale. Requirements, stakeholder
examples, and evidence need durable links so a change maps to affected
requirements and exact-SHA proof, not to tribal knowledge.

## Decision

The repository adopts a specification-driven assurance graph: normative
`REQ-*` requirements live in `openspec/specs/<capability>/spec.md`, evidence
mapping and Cucumber dispositions in `verification.yaml`, stakeholder examples
as `@REQ-*`/`@SCN-*` Gherkin features under `apps/e2e/acceptance`, and unit,
contract, property, Playwright, and runtime suites as the evidence layers.
`spec:validate`, `spec:trace`, `spec:impact`, `spec:verify`, and `spec:report`
keep the graph strict: every executable test file carries a `REQ-*` inventory
marker, and every requirement requires an explicit Cucumber disposition with
mapped alternative evidence when acceptance examples are absent.

## Consequences

- PRs touching requirements get impact analysis (`spec:impact`) and fresh
  evidence lanes (`spec:verify`) instead of full-matrix guesswork; nightly and
  dispatch workflows (`spec-assurance-nightly.yml`, `spec-assurance-runtime.yml`)
  produce exact-SHA dossiers.
- Adding a capability requires OpenSpec entries before downstream validation
  passes; this is deliberate overhead paid once per requirement.
- The graph raises confidence but is evidence, not proof that the original
  requirement is correct (`docs/specification-assurance.md`).

## Alternatives Considered

- Test-only traceability (tests as the specification): rejected because intent
  becomes unreviewable and requirements vanish into assertions.
- External requirements tooling with manual sync: rejected because the
  in-repo graph is what CI can enforce at merge time.

## Validation

`pnpm run spec:validate` in the fast gate, the lane/dossier commands documented
in `docs/specification-assurance.md`, and the assurance workflows listed in
`docs/ci-observability.md`.
