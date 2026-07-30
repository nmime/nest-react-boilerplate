## ADDED Requirements

### Requirement: [REQ-FRONTEND-JOURNEY-001] Critical journeys work in product renderers

Critical journeys SHALL be verified in the renderer users operate, including
responsive, accessibility, authentication, and error states.

#### Scenario: Browser journey

- **WHEN** a supported browser exercises the product stack
- **THEN** the critical journey remains usable

### Requirement: [REQ-FRONTEND-I18N-002] Locale and design contracts stay synchronized

Frontend products SHALL consume owned locale catalogs and shared design tokens
without hardcoded copy or renderer-incompatible primitives.

#### Scenario: Locale parity

- **WHEN** a supported locale builds
- **THEN** required product and common messages are available
