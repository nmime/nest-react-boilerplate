# Template agent skills

This template expects frontend agents to use UI/UX Pro Max first and LazyWeb for reference gathering before visual rewrites.

## UI/UX Pro Max priority hierarchy

1. User task and product intent: solve the requested flow before cosmetic cleanup.
2. Accessibility and semantics: keyboard paths, labels, landmarks, focus, contrast, reduced motion.
3. Design-system tokens: use shared `--xr-*` tokens, shadcn/ui-style primitives, Radix behavior, and Tailwind utilities.
4. Responsive proof: preserve the 320 px floor and explicitly test RU at 375 px with no horizontal overflow.
5. State and polish: loading, empty, error, current-route, light/dark, and high-contrast states.
6. Evidence: capture browser proof and update visual baselines only for intentional UI changes.

## LazyWeb instructions

LazyWeb is not vendored in this repository. When the skill is available in the agent environment, import or enable it from its published source before a redesign pass, then run its design-research workflow for the specific surface being changed.

Recommended workflow:

1. Import/enable LazyWeb in the agent runtime using the published LazyWeb skill link provided by your workspace or skill catalog.
2. Run LazyWeb research for the target, for example `admin product shell navigation`, `auth form controls`, or `landing app shadcn cards`.
3. Save generated reports under `.lazyweb/design-research/{topic}-{date}/report.html` and references under `.lazyweb/design-research/{topic}-{date}/references/`.
4. Summarize only the applicable patterns in the PR description; do not vendor LazyWeb repositories or large third-party assets.

See also `docs/frontend-uiux-pro-max-lazyweb.md` for the frontend checklist tied to this template.
