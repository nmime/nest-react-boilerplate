---
name: shadcn-ui
description: Select, inspect, add, or update source-owned web UI from the approved shadcn and Magic UI registries. Use when agents need shared @app/frontend-ui-web primitives, reviewed creative effects, registry discovery, or browser coverage for component behavior; the template exposes Aceternity only for non-persistent research preview and leaves any integration to each downstream product owner.
---

# Manage source-owned web UI

Keep shadcn as the canonical component system. Treat Magic UI as an optional
MIT-licensed source of presentation effects, not a second design system. Keep
Aceternity research-only in this template: allow search and non-persistent
preview, but never apply, vendor, package, or distribute its source.

## Read first

- Read the root and nearest `AGENTS.md` files, both `components.json` files
  (root and `libs/frontend`), current public exports, existing Storybook stories,
  and the component's consumers.
- Read `../../../docs/frontend-ux.md`,
  `../../../docs/testing/modern-qa.md`, and the selected registry item's source,
  dependency list, CSS, assets, documentation, and licence before applying it.

## Select the source

- Use shadcn for accessible primitives and application controls. Search existing
  source and exports first; compose what exists before importing another item.
- Use Magic UI only when a named product surface needs a deliberate motion or
  presentation effect. Prefer app composition over promoting product-specific
  blocks into shared UI.
- Search or preview Aceternity when it helps design research, but do not apply,
  copy, vendor, package, or distribute its source from this template.
- Do not use paid namespaces, authenticated registries, registry tokens, direct
  URLs, GitHub addresses, or arbitrary CLI options. A connected shadcn MCP may
  help discovery, but writes must still use the repository wrapper.

## Specification lifecycle

For a component addition or update that changes observable product or shared UI
behavior, establish or update the governing requirements with
`$specify-behavior` before applying source. Synchronize the component, owning
consumers, executable test markers, sidecars, and evidence through
`$implement-specified-change`. Pure non-persistent registry research does not
create a behavior change.

## Workflow

1. Discover items without writing:

   ```bash
   pnpm run ui:registry:search -- --source magicui --query "text effect"
   pnpm run ui:registry:search -- --source aceternity --query "background"
   ```

2. Preview the complete planned source before applying:

   ```bash
   pnpm run ui:shadcn:add -- <component>
   pnpm run ui:registry:add -- --source magicui <item> --view
   ```

   The pinned wrapper runs in `libs/frontend`, fixes the canonical target,
   rejects unapproved namespaces and options, and defaults to dry-run. On apply,
   it reruns a source-visible preflight and fails closed if the registry writes
   outside `libs/frontend/ui-web/lib/src/component`, its token CSS, or the
   frontend package manifest. Aceternity apply and all paid sources are blocked.

### Aceternity downstream handoff

- Treat preview output as temporary research evidence. Do not save it as
  repository source, a patch, a baseline, a skill asset, or generated template
  content.
- Do not claim that this template grants rights, pre-approves Aceternity use, or
  supplies its dependencies. It intentionally distributes none of them.
- If a product created from this template chooses Aceternity, require that
  downstream owner to review the then-current official licence and source,
  record its decision, select and install exact dependencies, choose its own
  canonical source boundary, adapt tokens and accessibility, and add its own
  tests and maintenance plan.
- Do not bypass the template guard for that project. Make an explicit,
  product-local policy change after the downstream review so responsibility is
  visible in that project's history.

3. Search the repository again for equivalent components and consumers. Pass
   `--apply` only for a product-needed shadcn or Magic UI item after reviewing
   source, dependencies, styles, assets, SSR behavior, accessibility, bundle
   cost, maintenance, and licence. `--overwrite` also requires `--apply` and
   deliberate review of the existing public API.
4. Keep any new frontend runtime dependency in `libs/frontend/package.json`,
   not in an individual library, an app package, or the root manifest. Review
   its license, maintenance, bundle impact, and accessibility before adding it.
5. Integrate generated source deliberately: preserve semantic project tokens,
   remove demo copy and app assumptions, use the configured icon library,
   respect reduced motion, keep SSR-safe browser access, expose canonical exports
   through `src/component/index.ts`, and add a `Ui*` wrapper only for an existing
   public API. Record required upstream attribution when source is vendored.
6. Add or update a deterministic Storybook story. Cover default, boundary,
   responsive, reduced-motion, keyboard, and theme states that matter. Use the
   browser Storybook lane—not JSDOM
   alone—for Dialog, Select, DropdownMenu, Popover, and other portal/focus
   interactions. Assert visible roles, keyboard close/selection, and focus
   restoration with accessible queries.
7. Do not use `shadcn init` or `shadcn apply`; this repository already owns its
   component configuration and theme tokens. Route theme changes through
   `@app/common-design-tokens` and the existing web CSS variables.

## Validation

Run focused component tests first. Then run all shared/public and agent-facing
gates because registry integration changes source ownership policy:

```bash
pnpm exec nx run @app/frontend-ui-web:test
pnpm exec nx run @app/frontend-ui-web:lint
pnpm exec nx run @app/frontend-ui-web:typecheck
pnpm run test:storybook
pnpm run frontend:fsd:check
pnpm run test:visual
pnpm run tooling:static-check
pnpm run agent:skills:check
git diff --check
```

Run the relevant app build/e2e and accessibility/performance checks when the
imported component is used by a product surface. Update visual baselines only
after manually reviewing deterministic expected changes. Do not add Chromatic
or another hosted service without explicit approval of its account, token, and
cost boundary.
