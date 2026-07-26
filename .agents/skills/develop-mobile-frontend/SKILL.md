---
name: develop-mobile-frontend
description: Implement Expo and React Native features within native UI boundaries. Use for mobile routes, Tamagui components, native API consumption, platform behavior, accessibility, export checks, and mobile end-to-end tests.
---

# Develop a mobile frontend

## Read first

- Read `../../../docs/project-catalog.md`, `../../../docs/frontend-state.md`,
  `../../../docs/frontend-ux.md`, the mobile app README/AGENTS files, and the
  native UI library public API.
- Inspect Expo routing, Tamagui configuration, platform targets, generated API client usage, and mobile test setup.
- Use `../plan-frontend-change/SKILL.md` when scope or ownership is unresolved,
  `../design-frontend-experience/SKILL.md` for new UX direction, and
  `../validate-frontend-quality/SKILL.md` for final native proof.

## Workflow

1. Keep deployable code under the selected Expo app and reusable native primitives in `@app/frontend-ui-native`.
2. Never import DOM-only libraries, browser globals, web CSS, Radix, or shadcn/ui into native scope.
3. Use shared contracts and generated clients while adapting navigation, storage, permissions, links, and lifecycle behavior to native platforms.
4. Cover loading, offline, denied, empty, error, and success states. Preserve safe areas, keyboard behavior, screen-reader labels, touch targets, and platform conventions.
5. Keep platform-specific files explicit and minimal; share domain logic through runtime-neutral libraries.
6. Add component tests and the relevant mobile e2e journey for critical flows.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Verification

Run native library and app lint, typecheck, tests, Expo export or build validation for affected targets, and mobile e2e when available. Report simulator, signing, or external-device blockers explicitly.
