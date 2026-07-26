## ADDED Requirements

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
