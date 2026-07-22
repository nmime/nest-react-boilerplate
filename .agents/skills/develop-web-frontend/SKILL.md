---
name: develop-web-frontend
description: Implement browser frontend features in the correct renderer and Feature-Sliced scope. Use for Vite, Astro, or Vike UI, routes, shared web components, API consumption, i18n, accessibility, Storybook, and browser tests.
---

# Develop a web frontend

## Read first

- Read `../../../docs/frontend-fsd.md`, `../../../docs/frontend-state.md`,
  `../../../docs/frontend-ux.md`, `../../../docs/project-catalog.md`, the target
  app README/AGENTS files, and `../shadcn-ui/SKILL.md` when shared UI is involved.
- Identify the renderer: Vite SPA, Astro landing, or Vike SSR. Do not transfer runtime assumptions between them.
- Use `../plan-frontend-change/SKILL.md` when scope or ownership is unresolved,
  `../design-frontend-experience/SKILL.md` for new UX direction, and
  `../validate-frontend-quality/SKILL.md` for final frontend proof.

## Workflow

1. Modify the existing app, route, or feature owner in place. Put reusable browser primitives in `@app/frontend-ui-web`; keep product behavior in its scoped feature library.
2. Respect Feature-Sliced public boundaries and stable aliases. Do not deep-import another slice's internals.
3. Use generated API clients and shared contracts rather than handwritten transport types.
4. Add translated copy through the locale owner; cover loading, empty, error, denied, and success states with real domain behavior.
5. Preserve responsive layout, keyboard access, focus management, reduced motion, semantic markup, and SSR safety where applicable.
6. Use component tests or Storybook interactions for component behavior and browser e2e for critical user journeys. Test portal behavior in browser mode.
7. Put deterministic screen compositions in the owning app's `storybook/` directory and register them through the shared web Storybook config. Keep routing, production providers, authentication, API integration, and complete page flows in app browser tests.

## Verification

Run target lint, typecheck, tests, build, relevant Storybook/browser lanes, `pnpm run frontend:fsd:check`, and `git diff --check`. Validate each affected frontend separately; app-composition stories prove deterministic screen rendering, not deployable routing or integration.
