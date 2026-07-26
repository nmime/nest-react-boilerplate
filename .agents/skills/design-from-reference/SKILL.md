---
name: design-from-reference
description: Translate a real-world design reference into intentional, original product UI expressed through repository tokens and primitives. Use when a request names a brand, live site, screenshot, or DESIGN.md file, or asks to match an external look, before designing or building the surface.
---

# Design from a real-world reference

Treat every reference as research, not a target to reproduce. Extract the
decisions that make it work, then express them originally through this
repository's tokens and primitives. Never clone another product's identity.

## Read first

- Read `../../../docs/frontend-uiux-pro-max-lazyweb.md`, `../../../docs/frontend-ux.md`, and `../../../docs/frontend-fsd.md`.
- Read `../design-frontend-experience/SKILL.md` for in-system design and `../shadcn-ui/SKILL.md` for source-owned component boundaries.
- Inspect the supplied reference (DESIGN.md file, URL, screenshot, or named product), the shared `@app/common-design-tokens` `--xr-*` scale, the current app screens, and existing Storybook stories before proposing anything.

## Capture the reference profile

1. Establish provenance and rights first. Public DESIGN.md catalogs are independent analyses of observable styling and carry no brand licence. Do not reproduce a third party's trade dress, logo, wordmark, proprietary typeface, or signature layout as product identity.
2. Extract a structured profile, not screenshots: type scale and pairing, color roles and contrast, spacing rhythm, radius, elevation, density, motion character, and the two or three decisions that give the reference its feel.
3. Separate transferable principles (hierarchy, restraint, rhythm, state clarity) from non-transferable identity (exact palette, brand type, mascot, ornament). Keep only the principles.
4. Reject anything that violates the repository's non-negotiables: the 320 px floor, RU 375 px no-overflow, WCAG contrast, keyboard and focus behavior, reduced motion, and light/dark parity.

## Translate into the system

1. Map each kept principle to an existing `--xr-*` token or shadcn/Radix primitive. Introduce a new token only when no existing one expresses the decision, and route it through `@app/common-design-tokens` for both themes.
2. Prefer a small number of intentional decisions over faithful imitation. Do not add one-off colors, a second UI framework, duplicated primitives, or speculative registry blocks to chase a look.
3. Curate, do not dump. Give the downstream agent the extracted profile and rationale, not the raw reference file. Undigested reference context raises cost without improving the result.
4. Hand structural design to `../design-frontend-experience/SKILL.md` and any new shared component to `../shadcn-ui/SKILL.md`; cover every UX state and accessibility requirement there.
5. Capture browser or device evidence against the repository floors and interaction states through `../validate-frontend-quality/SKILL.md`.

## Specification lifecycle

Translate only approved principles into observable requirements through
`$specify-behavior`, then pass the approved token, state, and evidence decisions
to `$implement-specified-change`. Reference research cannot authorize behavior
or substitute for product-owned acceptance criteria.

## Handoff

State the reference used and its rights status, the profile extracted, which principles were kept versus dropped, the token and primitive mapping (existing versus new), and the visual evidence. Name anything from the reference that was deliberately not reproduced and why. Do not vendor third-party brand assets, fonts, or logos, and never claim the result carries any brand's licence or endorsement.
