# Frontend UI/UX Pro Max + LazyWeb checklist

Use this checklist when changing the frontend/admin product shell, routing, auth forms, or landing surfaces.

## Template stack expectation

- Shared UI primitives live in `libs/frontend/ui/lib/src/lib/component` and should follow shadcn/ui architecture: token-driven components, `cn` utility, Tailwind classes, and Radix primitives where behavior or semantics benefit from them.
- Vite frontend apps (`admin-app`, `user-app`, `landing-app`) run Tailwind through `@tailwindcss/vite`; keep Tailwind wiring in each app config.
- Use real Radix imports for primitive behavior (`@radix-ui/react-slot`, `@radix-ui/react-label`, `@radix-ui/react-select`) rather than native-only lookalikes.

## UI/UX Pro Max priority hierarchy

1. **Intent and task success:** preserve the requested flow and accepted product gates before restyling.
2. **A11y and semantics:** labels, landmarks, current-page state, keyboard focus, contrast, reduced motion, and live regions.
3. **Design-system fidelity:** shared `--xr-*` tokens, shadcn-style primitive composition, Tailwind utilities, no one-off colors.
4. **Responsive quality:** prove the 320 px floor and RU 375 px no-overflow behavior.
5. **State polish:** light/dark, loading, empty, disabled, error, selected, hover, and focus states.
6. **Evidence:** tests plus browser proof; update visual baselines only when changes are intentional.

## Applied in the admin shell

- Keep admin navigation and brand links scoped under `/admin` when the app is reverse-proxy mounted.
- Expose product-shell navigation as a named `nav` landmark and mark exactly one current route with `aria-current="page"`.
- Provide a keyboard skip link to the main content target before repeated header controls.
- Preserve the existing design-system tokens: `--xr-color-*`, `--xr-radius-*`, `--xr-shadow-*`, and `--xr-focus-ring`.

## LazyWeb research method

LazyWeb is intentionally not vendored. When it is available in the agent environment, import/enable it from the published LazyWeb skill link in the workspace or skill catalog, then run `/lazyweb-design-research` for the exact surface being changed.

Save generated reports under `.lazyweb/design-research/{topic}-{date}/report.html` with references in `.lazyweb/design-research/{topic}-{date}/references/`. If LazyWeb is unavailable, document that blocker and use public references only as a fallback.

Fallback public references previously used for this pass:

- GOV.UK Design System skip link guidance: keyboard users should be able to bypass repeated navigation and jump to main content.
- MDN `aria-current` guidance: mark the current item in a related navigation set with `aria-current="page"` and expose only one current item.
- Shopify Polaris accessibility guidance: reusable shell components improve consistency, but integrated task flows still need accessibility testing.
