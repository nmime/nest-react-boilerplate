---
name: design-frontend-experience
description: Design or substantially reshape a web or native product experience within repository design-system boundaries. Use for new screens, visual direction, information architecture, responsive layouts, design-system evolution, UX states, accessibility design, or translating an approved reference into frontend behavior.
---

# Design a frontend experience

## Read first

- Read `../../../docs/frontend-uiux-pro-max-lazyweb.md`, `../../../docs/frontend-ux.md`, `../../../docs/frontend-state.md`, `../../../docs/frontend-fsd.md`, the selected app's README/AGENTS files, and the shared web or native UI public API.
- Inspect current screens in the running app and existing Storybook stories before proposing a new visual language. If a Figma file or approved design is supplied, treat it as the source of truth.

## Establish direction

1. Start from the product task, audience, hierarchy, and primary action. Preserve the existing visual language unless the request explicitly calls for a redesign.
2. Inventory reusable tokens, typography, spacing, icons, primitives, patterns, and interaction conventions. Web primitives belong in `@app/frontend-ui-web`; native primitives belong in `@app/frontend-ui-native`.
3. Define the complete experience: content hierarchy, navigation, responsive behavior, loading, empty, error, denied, disabled, selected, hover/focus, success, dark/high-contrast, reduced-motion, and recovery states.
4. Design semantics with the visuals: landmarks, heading order, labels, error association, keyboard path, focus placement/restoration, live regions, contrast, touch targets, safe areas, and motion alternatives.
5. Prove the 320 px web floor and RU at 375 px without horizontal overflow. For native, account for safe areas, keyboards, screen readers, platform conventions, and explicit platform variants.
6. Prefer a small number of intentional compositional decisions over ornamental complexity. Do not add one-off colors, duplicated primitives, speculative registry blocks, or a second UI framework.
7. Use external reference research only when it materially helps the requested surface. Record applicable patterns rather than copying third-party screens or assets. When the direction is anchored to a specific real-world example, start from `../design-from-reference/SKILL.md`. Shadcn owns controls and primitives; consider Magic UI only for a justified signature effect. In this template, keep Aceternity to non-persistent visual research and route any later integration decision to the downstream product owner through `../shadcn-ui/SKILL.md`.

## Specification lifecycle

Express new or changed user-visible states, accessibility behavior, responsive
invariants, and acceptance examples through `$specify-behavior` before code.
Hand the approved design and evidence contract to
`$implement-specified-change`; a visual artifact or supplied design does not
replace durable requirements.

## Turn design into code

- Pair with `../develop-web-frontend/SKILL.md` or `../develop-mobile-frontend/SKILL.md` for implementation.
- Add deterministic reusable states to Storybook for browser UI; add app compositions only when providers can be controlled. Keep routing, auth, API integration, and complete flows in app tests.
- Pair with `../validate-frontend-quality/SKILL.md` and capture browser or device evidence at the affected breakpoints and interaction states.
- Route token changes through `@app/common-design-tokens`; route shared web component additions through `../shadcn-ui/SKILL.md`.

## Handoff

Explain the chosen direction, reused primitives/tokens, responsive and accessibility behavior, states covered, and visual/browser evidence. Identify any supplied design details that could not be reproduced and why.
