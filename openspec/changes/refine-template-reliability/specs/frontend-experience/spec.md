## MODIFIED Requirements

### Requirement: [REQ-FRONTEND-NATIVE-006] Native UI remains platform-safe

Expo routes, Tamagui primitives, native API consumption, and platform helpers
SHALL avoid DOM-only dependencies and preserve native accessibility and export.

**Evidence profile:** domain, tooling

**Invariants:**

- Shared native code remains importable on supported platforms.
- Browser-only globals are guarded outside web-only boundaries.
- Native API configuration consumes explicit absolute service URLs without
  URL credentials, queries, or fragments. Same-origin applies only to web.
  An unconfigured native shell remains local-only and sends no preference writes.
- Native requests omit ambient browser cookies and offer an injected session
  transport for product-owned secure credentials; public Expo configuration
  never contains credentials. Browser export keeps its cookie transport.
- Expo web exports render in Chromium and WebKit, support keyboard language
  changes, and pass accessibility and horizontal overflow checks.

**Failure behavior:**

- Renderer-incompatible code fails native typecheck, tests, or export.

#### Scenario: Native export

- **WHEN** the mobile application exports for a supported platform
- **THEN** routes and shared native UI compile without DOM-only assumptions

### Requirement: [REQ-FRONTEND-I18N-002] Locale and design contracts stay synchronized

Frontend deployables SHALL consume owned translation catalogs and shared
design tokens without hardcoded user-facing copy or renderer-incompatible
primitives.

**Evidence profile:** domain, documentation

**Invariants:**

- Supported locale catalogs retain key parity.
- Translations preserve the meaning of controls, technical concepts, placeholders,
  brand names, and literal commands. A translated string is not accepted solely
  because it contains a non-Latin character or passes key parity.
- Shared primitives preserve accessible names and states.

**Failure behavior:**

- Missing catalog keys or boundary violations fail repository checks.

#### Scenario: Locale catalog parity

- **WHEN** a supported locale is built
- **THEN** required product and common messages remain available

### Requirement: [REQ-FRONTEND-SSR-007] Server-rendered frontends hydrate consistently

Astro and Vike surfaces SHALL preserve server/client rendering, locale, theme,
navigation, and error-state consistency.

**Evidence profile:** domain, journey

**Invariants:**

- Hydration does not replace semantically different initial content.
- Server code does not depend on browser-only state.
- Site account and landing actions use explicitly configured safe public destinations
  with identical server and hydration hrefs; unconfigured actions are omitted.
- Unknown site routes return a localized, safe 404 page with the same shell and
  response security policy; internal errors retain a generic safe error page.

**Failure behavior:**

- SSR, hydration, or route mismatch fails build or browser evidence.

#### Scenario: Hydrated route

- **WHEN** a server-rendered route becomes interactive
- **THEN** its accessible content and state remain consistent

#### Scenario: Unknown site route

- **WHEN** a visitor opens a route that the SSR site does not own
- **THEN** the response is 404 and displays a localized recovery link
- **AND** framework diagnostics and internal exception text are not rendered
