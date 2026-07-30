## Evidence Policy

All 90 discovered Nx projects must be capability-owned. Critical requirements
require different product and verification owners. Evidence selection follows
risk: PRs run structural and focused deterministic gates; main adds contracts
and component evidence; nightly adds mutation, property, resilience, and
recovery; runtime executes full product journeys and environment-bound checks.

## Requirement Evidence

| Requirement group | Risk          | Required evidence                                       | Repository owners                   |
| ----------------- | ------------- | ------------------------------------------------------- | ----------------------------------- |
| `REQ-ASSURANCE-*` | critical      | Cucumber, static, Vitest, mutation, workflow/operations | tooling, quality, security, release |
| `REQ-AUTH-*`      | critical      | Cucumber, Vitest, security, component, Playwright       | identity, quality, security         |
| `REQ-API-*`       | high          | Cucumber, contracts, Vitest, property, static           | API, consumers, tooling             |
| `REQ-NOTIFY-*`    | high/critical | Cucumber, Vitest, operations                            | notifications, quality, operations  |
| `REQ-FRONTEND-*`  | normal/high   | Vitest, Playwright, documentation                       | frontend, accessibility quality     |
| `REQ-RUNTIME-*`   | high/critical | Vitest, component, operations                           | runtime, reliability, operations    |
| `REQ-SOCIAL-*`    | high/critical | Vitest, security, operations                            | integrations, quality, security     |
| `REQ-SCAFFOLD-*`  | high          | static, Vitest, documentation                           | tooling, generated-code maintainers |

The precise file, target/script, scenario, owner, profile, risk, and lane mapping
is canonical in each durable capability's `verification.yaml`.

## Independence Review

Behavior is not accepted from one generated assertion. Gherkin examples exercise
public domain behavior, while separately owned Vitest, contract, component,
Playwright, security, mutation, and operational suites attack different failure
modes. High-risk manifests reject identical product and verification owners.

## PR, Main, Nightly, and Runtime Lanes

- PR: OpenSpec/trace validation, focused Cucumber, static, unit/domain, security,
  and tooling evidence for impacted requirements.
- Main: PR evidence plus provider/consumer contracts, property tests, and
  component/persistence gates selected for changed requirements.
- Nightly: all requirements' mutation, property, component, resilience, load,
  chaos, observability, rollback, and recovery evidence.
- Runtime: the full product Playwright journey against the repository-owned
  Docker stack. Deployed/provider canaries remain separate operational
  evidence; this lane does not convert an unavailable external environment into
  a passing source-code result.

## Migration Validation

- OpenSpec strict validation passed for all durable specifications and this
  change.
- Trace validation covered 90/90 projects, 17 requirements, and 51 evidence
  references.
- The repository fast gate passed 78 lint targets, 78 typecheck targets, and 68
  test targets; the acceptance project passed 8 scenarios and 25 steps.
- Fresh-workspace onboarding generated, built, tested, and typechecked all
  supported app/library shapes, including a generated Cucumber project.
- PR-equivalent tooling, docs, trace, formatting, secret, SAST, and dependency
  audit gates passed with no known production dependency vulnerabilities.
- The complete migration diff was reviewed by workflow, dependency, generator,
  assurance, acceptance, documentation, and formatting-only categories.

## Runtime and Environment Boundary

The nightly and runtime workflows are committed executable gates, but their
hosted executions occur only after this revision is pushed. The runtime journey
builds and starts the local Docker stack through Playwright global setup.
Provider credentials, production traffic, production telemetry, and
organization-specific exploratory approval are intentionally not fabricated by
the repository and remain release-environment evidence.

## Residual Risk

- Product owners may still state an incorrect requirement or omit an unknown scenario.
- Production/provider behavior can differ from controlled environments.
- Evidence quality depends on independent review, useful assertions, and maintained data.

These risks are controlled through discovery examples/counterexamples, review
ownership, mutation, property tests, operational telemetry, incident-to-spec
feedback, and explicit runtime readiness rather than by claiming formal proof.

## Independent Verification Reviewer

- Quality engineering and the applicable capability/security/operations owner
  must review changes to critical requirement evidence.
