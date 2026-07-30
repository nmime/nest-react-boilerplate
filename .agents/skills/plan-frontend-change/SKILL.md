---
name: plan-frontend-change
description: Plan a browser or native frontend change before implementation. Use for new screens, multi-app features, redesigns, shared UI changes, renderer migrations, responsive work, or any frontend request whose ownership, states, dependencies, risks, or validation need to be resolved first.
---

# Plan a frontend change

## Read first

- Read `../../../docs/ai/retrieval-policy.md`, `../../../docs/ai/repo-map.md`, `../../../docs/project-catalog.md`, and the nearest app/library `AGENTS.md`, README, project config, routes, tests, and public exports.
- Read `../../../docs/frontend-fsd.md`, `../../../docs/frontend-state.md`, `../../../docs/frontend-ux.md`, and the renderer-specific source. Read `../design-frontend-experience/SKILL.md` for new visual direction and `../validate-frontend-quality/SKILL.md` for the proof plan.

## Resolve the plan

1. Identify the selected deployable and renderer: Vite SPA, Astro islands, Vike SSR, or Expo/React Native. No frontend is the default.
2. Trace the existing owner before proposing structure: route/screen, feature slice, shared web/native UI, generated API client, contracts, i18n, auth, state, and e2e project.
3. Describe the user journey and observable acceptance criteria. Include loading, empty, success, validation, denied, offline where relevant, failure, and recovery states.
4. Decide what stays app-owned and what is genuinely reusable. Reuse `@app/frontend-ui-web` or `@app/frontend-ui-native`; do not create app-local design systems or adjacent replacement apps.
5. When external UI source is proposed, name the registry and exact item, prove no equivalent exists, classify primitive versus product composition, and record licence, dependencies, assets, CSS, SSR, motion, accessibility, maintenance, and bundle implications. Follow `../shadcn-ui/SKILL.md` for the approved registry boundary.
6. Record cross-boundary work explicitly: API/OpenAPI, generated clients, permissions, translations, analytics, persistence, deployment, or migrations. Chain the matching repo skills for those boundaries.
7. Define responsive, accessibility, theme, localization, SSR/hydration, and platform constraints before component details.
8. Build a risk-based validation map: focused component tests, Storybook interactions, visual regression, app browser/mobile e2e, accessibility, performance, builds, and generated-artifact checks.
9. Sequence work into independently verifiable steps. State decisions, assumptions, blockers, expected files/owners, and commands without inventing files before inspecting the source.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Plan output

Produce a compact implementation brief with:

- selected app, renderer, owners, and non-goals
- journey, states, and acceptance criteria
- design-system and data/contract decisions
- ordered implementation slices
- quality gates for each risk
- documentation or generated artifacts that must change
- unresolved decisions that would materially alter the solution

If implementation is also requested, execute the plan in place and revise it when source evidence invalidates an assumption.
