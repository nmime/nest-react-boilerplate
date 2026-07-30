## Context

Version 2 evidence sidecars introduced exact requirement-level project
ownership and evidence profiles. They make existing Cucumber references
traceable, but they do not record why a requirement has no Cucumber evidence.
An absent acceptance profile is therefore ambiguous to a reviewer.

This is a cross-cutting assurance metadata change affecting the schema,
validator, trace report, eight durable sidecars, agent workflows,
documentation, and CI evidence selection. It changes no product runtime.

## Goals / Non-Goals

**Goals:**

- Give all requirements a complete Cucumber disposition.
- Reject implicit absence, contradictions, placeholder rationales, and
  alternatives without mapped evidence.
- Preserve concise stakeholder Gherkin rather than duplicate lower-level tests.
- Make trace and exact-SHA reports expose disposition completeness.

**Non-Goals:**

- Create Cucumber scenarios for unit-level permutations.
- Replace OpenSpec scenarios, Vitest, Playwright, contracts, or runtime checks.
- Infer whether a human requirement is correct or complete.

## Decisions

### Introduce version 3 sidecars

The required metadata is a breaking schema change, so all sidecars move
atomically from version 2 to version 3 and the schema identifier becomes
`urn:nrb:spec-evidence:v3`. Keeping version 2 would make two incompatible
documents claim the same contract.

### Use a structured `cucumber` object per requirement

Acceptance example:

```yaml
cucumber:
  disposition: acceptance
```

Non-applicable example:

```yaml
cucumber:
  disposition: not-applicable
  reason: Persistence rollback is verified at the real database boundary.
  alternativeEvidence:
    - component
```

A boolean or profile-only representation was rejected because it cannot carry
reviewable intent. Free-form text alone was rejected because it cannot be
matched to executable evidence.

### Split structural and semantic validation

JSON Schema enforces version, object shape, allowed dispositions, meaningful
minimum lengths, and non-Cucumber alternative kinds. The TypeScript validator
enforces cross-field behavior:

- `acceptance` requires the acceptance profile and Cucumber evidence.
- `not-applicable` forbids the acceptance profile and Cucumber evidence.
- every alternative kind must exist in the requirement's evidence.
- normalized alternative kinds must be unique and non-empty.

This keeps editor/schema feedback fast while retaining actionable
requirement-aware errors.

### Report dispositions independently

Trace output adds:

- requirements with a disposition;
- acceptance requirements;
- not-applicable requirements;
- not-applicable alternative kinds.

These totals remain separate from feature, scenario, executable-test, and
selected-evidence totals so no category can be misrepresented as another.

### Require requirement-specific rationales

Each of the 53 current non-acceptance requirements receives a concrete reason
describing why another executable boundary is more faithful. Reusing one
generic sentence everywhere is not acceptable migration evidence.

## Risks / Trade-offs

- **Risk: sidecars fail until migration is complete** → Change schema,
  validator, all eight sidecars, tests, and docs atomically.
- **Risk: rationales become boilerplate** → Enforce minimum trimmed length and
  review tailored reasons in the diff.
- **Risk: alternatives drift from evidence** → Require each named kind to exist
  in the same requirement.
- **Risk: every requirement is pushed into Gherkin** → Preserve
  `not-applicable` with explicit alternative evidence.
- **Trade-off: version 3 is breaking** → Prefer an honest version bump over
  silently changing the meaning of version 2.

## Migration Plan

1. Extend types, schema, parser, validation, and trace reporting for version 3.
2. Add failing and passing regression fixtures.
3. Migrate all 58 requirements in all eight sidecars.
4. Update the durable requirement, policy, skills, and canonical documentation.
5. Validate OpenSpec, dispositions, projects, tests, evidence, and exact-SHA
   selection.
6. Archive the completed change and run the full local and hosted PR gates.

Rollback reverts the metadata/tooling commit set. No data, deployment, or
runtime cleanup is required.

## Open Questions

None.
