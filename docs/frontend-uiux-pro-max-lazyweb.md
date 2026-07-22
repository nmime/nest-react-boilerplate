# Frontend UI/UX Pro Max + LazyWeb checklist

Use this checklist when changing the frontend/admin product shell, routing, auth forms, or landing surfaces.

## Template stack expectation

- Shared web UI primitives live behind `@app/frontend-ui-web` in
  `libs/frontend/ui-web/lib` and should follow shadcn/ui architecture:
  token-driven components, `cn` utility, Tailwind classes, and Radix primitives
  where behavior or semantics benefit from them. The legacy package under
  `libs/frontend/ui-web/lib` directly owns the web design system and Storybook configuration.
- `@app/frontend-ui-web` exposes canonical shadcn-style component names such as
  `Button`, `Card`, `Dialog`, `Select`, `Tabs`, `Checkbox`, `Switch`, `Table`,
  and `Input`, while preserving `Ui*` compatibility wrappers for existing apps.
  New web UI code should prefer the canonical names unless it is intentionally
  matching existing app code.
- Use shadcn/ui as a source-owned component system, not as duplicated app-local
  scaffolding. Do not create `components/ui` folders under apps, do not import
  Radix/CVA/`clsx`/`tailwind-merge` directly from app code, and do not copy every
  registry component preemptively. Add only product-needed primitives to
  `@app/frontend-ui-web`.
- Native UI primitives live behind `@app/frontend-ui-native` and use Tamagui
  with shared design tokens from `@app/common-design-tokens`.
- Current web apps use different renderers: `landing-app` is Astro with React
  islands, `site-app` is Vike with React SSR, and `admin-app`/`user-app` are
  Vite React apps during the transition. Keep Tailwind wiring in the owning web
  app config.
- Use real Radix imports for primitive behavior (`@radix-ui/react-slot`, `@radix-ui/react-label`, `@radix-ui/react-select`) rather than native-only lookalikes.

## Source registry policy

The pinned shadcn CLI is the only registry client. Its namespace model exposes
source for review before installation; repository tooling narrows that model to
three explicit sources and never accepts direct URLs, GitHub addresses,
authenticated namespaces, or arbitrary CLI options.

| Source     | Role                                         | Repository write policy                                                                                                        |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| shadcn     | Canonical controls and accessible primitives | Dry-run first; reviewed apply into `@app/frontend-ui-web`                                                                      |
| Magic UI   | Optional motion and presentation effects     | MIT source may be applied after duplicate, path, dependency, CSS, asset, SSR, accessibility, reduced-motion, and bundle review |
| Aceternity | Visual research and candidate discovery      | Non-persistent preview only; this template never applies, vendors, packages, or distributes its source                         |

Use `pnpm run ui:registry:search -- --source <source>` for discovery and
`pnpm run ui:registry:add -- --source <source> <item> --view` for a source-visible
preview. Aceternity preview output is temporary research evidence and must not
be saved into template source, patches, baselines, skills, or generated output.
The apply command reruns a fail-closed preflight. Paid Magic UI Pro, Aceternity
Pro, tokens, and private registries are intentionally unsupported.

A downstream product generated from this template may make its own Aceternity
decision. Its owner must review the then-current official licence and source,
record that decision, install exact dependencies, define the product-local
source boundary, adapt tokens and accessibility, and own testing and maintenance.
That requires an explicit downstream policy change; this template does not grant
rights, pre-approve use, or ship any Aceternity source or dependency.
The upstream references are the
[shadcn namespace contract](https://ui.shadcn.com/docs/registry/namespace),
[Magic UI MIT repository](https://github.com/magicuidesign/magicui), and
[Aceternity licence](https://ui.aceternity.com/licence).

Do not import a registry item merely because it exists. Start from product
intent, search existing source and exports, and keep product-specific blocks in
the owning app. Promote only genuinely reusable, token-adapted primitives or
effects to shared UI. React DOM registry source never belongs in Expo/native UI.

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
