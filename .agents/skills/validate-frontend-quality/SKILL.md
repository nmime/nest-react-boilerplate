---
name: validate-frontend-quality
description: Select and run risk-based quality gates for browser and native frontend changes. Use before frontend handoff or merge, after UI implementation or redesign, when visual baselines change, or when accessibility, responsiveness, portals, SSR, routing, API integration, performance, or mobile behavior must be proven.
---

# Validate frontend quality

## Read first

- Read `../../../docs/testing.md`, `../../../docs/testing/modern-qa.md`,
  `../../../docs/command-matrix.md`, `../../../docs/local-verification.md`,
  affected project targets, and the nearest app/e2e instructions.

## Build the gate map

- Classify each changed owner and risk: shared web UI, web app composition, native UI, routing, SSR/hydration, API/auth integration, responsive layout, accessibility, performance, i18n, tokens, or generated contracts.

## Apply the gates

1. Run affected lint, typecheck, unit/component tests, build/export, `pnpm run frontend:fsd:check`, formatting, and `git diff --check`.
2. For shared browser components, run Storybook build and interaction tests. Exercise Dialog, Select, menus, popovers, focus, keyboard, and portals in a real browser.
3. Run visual regression only for deterministic stories tagged `visual`. Review expected/actual/diff artifacts; update baselines only for an intentional accepted change, then rerun the non-update command.
4. Use app browser e2e for routing, real providers, auth, API integration, SSR/hydration, navigation, and complete page flows. Test each affected renderer separately.
5. Run accessibility automation where supported and manually verify semantics, keyboard flow, focus, contrast, zoom/reflow, reduced motion, and touch targets for changed interactions.
6. Verify responsive web behavior at the 320 px floor, RU at 375 px, affected desktop widths, and relevant mobile browser projects. Treat mobile browser emulation as responsive-web proof, not React Native proof.
7. For imported motion or registry source, verify reduced motion, deterministic timers/data, SSR-safe browser access, dependency placement, public exports, attribution, absence of app-local `components/ui`, and reviewed visual output before accepting a baseline.
8. For Expo/React Native, run native library/app tests, Expo export or build validation, and mobile e2e when available. Report simulator, signing, or device blockers explicitly.
9. Run API contract/client freshness, performance, security, Docker/fullstack, or deployment checks when the frontend change crosses those boundaries.

## Gate policy

- A missing browser, Docker engine, simulator, runtime target, or baseline is unverified or blocked—not a pass.
- Do not weaken thresholds, remove assertions, add arbitrary waits, or accept snapshots to make a failure disappear.
- Distinguish component rendering, app composition, responsive web, native behavior, and production integration evidence.
- For shared UI or token changes, broaden validation to every consuming frontend class.

## Specification assurance

For behavior-changing diffs, include
`$review-specification-assurance` in the independent review so requirement
completeness, ownership, evidence meaning, and exact-SHA provenance are checked.

## Report

List commands and outcomes by risk, include artifact locations for failures, and state the exact unverified boundary. Pair with `../validate-change/SKILL.md` when the diff also changes backend, infrastructure, generators, or other non-frontend owners.
