# Frontend UI/UX Pro Max + Lazyweb checklist

Use this checklist when changing the frontend/admin product shell, routing, or landing surfaces.

## Applied in the admin shell

- Keep admin navigation and brand links scoped under `/admin` when the app is reverse-proxy mounted.
- Expose product-shell navigation as a named `nav` landmark and mark exactly one current route with `aria-current="page"`.
- Provide a keyboard skip link to the main content target before repeated header controls.
- Preserve the existing design-system tokens: `--xr-color-*`, `--xr-radius-*`, `--xr-shadow-*`, and `--xr-focus-ring`.

## UI/UX Pro Max pass criteria

- **Style + palette:** reuse shared CSS custom properties; do not introduce one-off colors without naming them as tokens.
- **Typography:** keep the large landing/product-shell heading scale and readable body line-height.
- **Product shell:** verify brand, status, primary actions, and content landmarks are consistent across apps.
- **Accessibility:** check skip links, landmark names, active-route state, keyboard focus, reduced motion, and high-contrast overrides.
- **Responsiveness:** test the 320 px floor and the existing `max-width: 720px` shell breakpoint.
- **Motion:** any hover/focus motion must be disabled by the `prefers-reduced-motion` override.

## Lazyweb research method

Lazyweb MCP/token access was not available during this follow-up, so no Lazyweb screenshot pack was generated. When it is available, run `/lazyweb-design-research` for `admin product shell navigation` and save its HTML report under `.lazyweb/design-research/{topic}-{date}/report.html` with references in `.lazyweb/design-research/{topic}-{date}/references/`.

Fallback public references used for this pass:

- GOV.UK Design System skip link guidance: keyboard users should be able to bypass repeated navigation and jump to main content.
- MDN `aria-current` guidance: mark the current item in a related navigation set with `aria-current="page"` and expose only one current item.
- Shopify Polaris accessibility guidance: reusable shell components improve consistency, but integrated task flows still need accessibility testing.
