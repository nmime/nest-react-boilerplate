# Frontend experience specification

## Purpose

Keep browser and native products accessible, localized, resilient, and
validated through real user journeys in addition to component rules.

## Requirements

### Requirement: [REQ-FRONTEND-JOURNEY-001] Critical journeys work in product renderers

Authentication, navigation, preference, and error-recovery journeys SHALL be
verified in the renderer that users operate, including responsive and
accessibility states.

**Evidence profile:** journey, domain

**Invariants:**

- Component tests do not replace browser or native journey evidence.
- UI authorization remains consistent with backend denials.

**Failure behavior:**

- A broken critical journey or serious accessibility violation blocks its lane.

#### Scenario: Browser critical journey

- **WHEN** the product stack is exercised through a supported browser
- **THEN** navigation, authentication, and safe error handling remain usable

### Requirement: [REQ-FRONTEND-I18N-002] Locale and design contracts stay synchronized

Frontend deployables SHALL consume owned translation catalogs and shared
design tokens without hardcoded user-facing copy or renderer-incompatible
primitives.

**Evidence profile:** domain, documentation

**Invariants:**

- Supported locale catalogs retain key parity.
- Shared primitives preserve accessible names and states.

**Failure behavior:**

- Missing catalog keys or boundary violations fail repository checks.

#### Scenario: Locale catalog parity

- **WHEN** a supported locale is built
- **THEN** required product and common messages remain available
