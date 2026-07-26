## Context

The Nx monorepo already has Vitest, Playwright, contract/property, component,
security, mutation, and operational suites. Their value was diluted by the lack
of one durable requirement graph and exact-revision evidence policy.

## Goals / Non-Goals

**Goals:**

- Create a source-controlled requirement-to-project-to-evidence graph.
- Keep the graph mechanically valid as projects and features change.
- Execute proportional evidence by lane and preserve a compact dossier.
- Make the acceptance project generator-owned and repeatable.

**Non-Goals:**

- Build a second test runner around existing suites.
- Make Cucumber the source of low-level domain truth.
- Treat CI success as production readiness without runtime evidence.

## Decisions

- OpenSpec durable specs are normative; `verification.yaml` is the executable
  evidence sidecar validated by repository tooling.
- Stable `REQ-*` and `SCN-*` identifiers are embedded in specs, features, and
  evidence sources so drift is detectable without heuristic test-name matching.
- Evidence profiles require independent kinds: acceptance/Cucumber,
  domain/Vitest, API/contracts, journey/Playwright, persistence/component,
  security, operations, tooling, documentation, and mutation.
- Lanes are explicit arrays on each evidence reference. `spec:verify` selects
  one lane and deduplicates Nx targets and root scripts.
- Cucumber uses TypeScript via Node's `--import tsx`, scenario-isolated World
  instances, deterministic serial execution, and message/HTML/JUnit reports.
- Impact calculation maps changed evidence/spec files and Nx project roots to
  requirements; changes to assurance infrastructure conservatively affect all.
- Release is triggered by successful CI `workflow_run`, checks out that SHA,
  proves it is current main, and never writes a changelog commit after CI.

## Risks / Trade-offs

- Evidence annotations add maintenance work; hard validation makes the work visible.
- Capability-level project mapping is intentionally coarse for the initial
  migration; requirements can be split as behavior evolves.
- Nightly/runtime gates take longer and need infrastructure, so lane status must
  remain visible rather than being collapsed into PR success.
- No automated system can prove that product owners did not omit a scenario;
  discovery, independent ownership, mutation, telemetry, and incident feedback
  reduce that residual risk but do not eliminate it.
