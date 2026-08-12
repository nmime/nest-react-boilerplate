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

### Requirement: [REQ-FRONTEND-ACCESSIBILITY-003] Interactive UI is accessible

Shared and application-owned web UI SHALL expose semantic names, keyboard
operation, focus behavior, contrast, reduced motion, and responsive layouts.

**Evidence profile:** domain, journey

**Invariants:**

- Interactive controls remain operable without pointer input.
- Responsive layouts preserve the supported narrow viewport floor.

**Failure behavior:**

- Serious accessibility or overflow regression blocks the owning quality lane.

#### Scenario: Keyboard interaction

- **WHEN** a user operates an interactive control with the keyboard
- **THEN** focus and action behavior remain visible and equivalent

### Requirement: [REQ-FRONTEND-SHELL-004] Product shells preserve routing and state ownership

Admin, user, landing, site, and mobile shells SHALL compose routes, providers,
navigation, themes, and owned feature state without crossing renderer or FSD
boundaries.

**Evidence profile:** domain, journey

**Invariants:**

- Shared libraries do not own deployable routing.
- One application's product state cannot leak into another deployable.
- Product identity — title, icon, and theme colour — resolves from shared
  configuration for every shell, in the shipped markup and again at start-up, so
  rebranding never means editing per-application markup or source.

**Failure behavior:**

- Invalid route, provider, or boundary composition fails build or navigation.

#### Scenario: Application navigation

- **WHEN** a supported route is opened in its owning renderer
- **THEN** the correct shell and providers render without boundary violations

### Requirement: [REQ-FRONTEND-ERROR-005] API failures produce safe recoverable UX

Frontend API support, overlays, toast rules, and feature flows SHALL translate
safe public failures into accessible recovery without exposing private details.

**Evidence profile:** domain, api, journey

**Invariants:**

- Internal stack traces and metadata are never rendered.
- Authentication denials clear protected state before recovery.

**Failure behavior:**

- Unknown failures render a bounded generic state with retry or exit behavior.

#### Scenario: Safe unknown failure

- **WHEN** a request fails without a recognized public presentation
- **THEN** the UI shows a generic accessible recovery state

### Requirement: [REQ-FRONTEND-NATIVE-006] Native UI remains platform-safe

Expo routes, Tamagui primitives, native API consumption, and platform helpers
SHALL avoid DOM-only dependencies and preserve native accessibility and export.

**Evidence profile:** domain, tooling

**Invariants:**

- Shared native code remains importable on supported platforms.
- Browser-only globals are guarded outside web-only boundaries.

**Failure behavior:**

- Renderer-incompatible code fails native typecheck, tests, or export.

#### Scenario: Native export

- **WHEN** the mobile application exports for a supported platform
- **THEN** routes and shared native UI compile without DOM-only assumptions

### Requirement: [REQ-FRONTEND-SSR-007] Server-rendered frontends hydrate consistently

Astro and Vike surfaces SHALL preserve server/client rendering, locale, theme,
navigation, and error-state consistency.

**Evidence profile:** domain, journey

**Invariants:**

- Hydration does not replace semantically different initial content.
- Server code does not depend on browser-only state.

**Failure behavior:**

- SSR, hydration, or route mismatch fails build or browser evidence.

#### Scenario: Hydrated route

- **WHEN** a server-rendered route becomes interactive
- **THEN** its accessible content and state remain consistent

### Requirement: [REQ-FRONTEND-DESIGN-008] Shared design primitives remain source-owned

Web/native components, design tokens, Storybook compositions, and reviewed
visual baselines SHALL remain source-owned, reusable, and compatible with
application themes.

**Evidence profile:** domain, documentation

**Invariants:**

- Application UI consumes shared tokens rather than private copied values.
- Visual baselines change only with reviewed intentional output.

**Failure behavior:**

- Token, export, snapshot, or registry boundary drift fails quality validation.

#### Scenario: Shared primitive change

- **WHEN** a shared primitive changes intentionally
- **THEN** component behavior and reviewed visual evidence remain synchronized
