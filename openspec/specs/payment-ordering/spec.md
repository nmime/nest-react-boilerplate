# Payment ordering specification

## Purpose

Scaffold-stage contract for the payments capability. The five generated
projects compile, each resolves only through its flattened `@app` alias,
and the scaffold unit suites trace to a single requirement. U2+ re-points
the `REQ-PAYMENTS-SCAFFOLD-001` markers at the ordering, provider, and
webhook requirements this capability will carry, and adds the provider
and webhook spec directories named by the payments design.

## Requirements

### Requirement: [REQ-PAYMENTS-SCAFFOLD-001] The payments scaffold compiles and resolves through its aliases

The five payments projects SHALL build, their unit suites SHALL pass with
full coverage of the non-spec sources, and every project SHALL be
importable only through its flattened alias declared in
`tsconfig.base.json` — one alias per source target.

**Evidence profile:** domain, documentation

**Invariants:**

- The scaffold carries no provider, state-machine, or persistence
  behaviour; its requirement markers are scaffold-level and are
  re-pointed by U2+ before the real behaviour lands.
- One alias per source target: no project is imported through a
  filesystem path or a second alias.

**Failure behavior:**

- A project that cannot be imported through its alias fails the type
  check of every consumer, so alias resolution is proven by the suites
  rather than assumed.

#### Scenario: A consumer imports a payments project

- **WHEN** a module imports `@app/backend-feature-payments-shared` (or
  any of the other four payments aliases)
- **THEN** the import resolves through `tsconfig.base.json` paths to the
  project's `src/index.ts` barrel
- **AND** the project's unit suite passes with full coverage of its
  non-spec sources
