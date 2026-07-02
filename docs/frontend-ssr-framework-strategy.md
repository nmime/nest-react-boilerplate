# Frontend SSR framework strategy

Status: accepted for the next frontend architecture stage.

Date: 2026-07-02.

## Decision

Use two SSR-capable web frameworks with different ownership boundaries:

- `apps/frontend/landing`: Astro with React islands.
- `apps/frontend/site`: Vike with React SSR for the product/user site.
- `apps/frontend/admin`: keep the existing Vite React SPA unless admin SEO,
  first-load SSR, or server auth gates become product requirements.

This resolves the current framework choice as Astro for landing and Vike for
the product site. Do not introduce Next.js for these two surfaces unless Vike
fails a repo-local proof of authenticated SSR, route guards, and deployment.

This is intentionally not a single universal framework choice. Landing and the
authenticated site have different runtime needs:

- Landing is content and SEO first. It should ship static or mostly static HTML,
  hydrate only the interactive React islands it needs, and support MDX/content
  workflows.
- Site is application first. It needs authenticated SSR, server-side data
  loading, redirects, route guards, app shell state, and a migration path from
  the current Vite React user app.

## Why Astro for landing

Astro is the correct default for the marketing/landing surface because it is
content oriented and React is optional per island instead of making the whole
page a React application.

Use the current package baseline:

- `astro@7.0.5`
- `@astrojs/react@6.0.0`
- `@astrojs/mdx@7.0.1` when docs, changelog pages, pricing copy, or long-form
  content become part of the landing surface.
- `@astrojs/sitemap@3.7.3` for sitemap generation.
- `@astrojs/node@11.0.1` only when landing needs on-demand rendering, sessions,
  server islands, or Node deployment. Static output remains preferred when the
  page can be pre-rendered.

Landing React islands may import shared frontend runtime contracts and
frontend-safe feature core, but Astro pages must not become thin wrappers around
the old SPA. Prefer `.astro` pages, content collections, and small React islands
for interactive pieces such as locale/theme switchers, auth CTAs, calculators,
or demos.

## Why Vike for site

Vike is the better fit for the authenticated product site than Astro because it
keeps the current Vite/React mental model while adding SSR, data loading, route
configuration, and server integration.

Use the current package baseline:

- `vike@0.4.260`
- `vike-react@0.6.25`
- `@vikejs/fastify@0.2.5` for the Node/Fastify server adapter, matching the
  backend preference for Fastify.

Site pages should use Vike page files and Vike server data hooks for initial
SSR data. Client-side TanStack Query can still own live refetching, mutations,
and cache updates after hydration.

The site should be a new app boundary, not a hidden mutation of the current
`user-app` until parity is proven. Migrate routes incrementally:

1. Create `apps/frontend/site` with Vike and React SSR.
2. Move route-independent runtime and business logic out of
   `@app/frontend-ui`.
3. Move auth, profile, settings, and preference hooks into feature-core
   libraries with no DOM, Vite, Vike, Astro, or React Native dependency.
4. Rebuild each user route in `site` against the shared feature core and
   `ui-web`.
5. Retire `user-app` after route, auth, e2e, and deployment parity.

## Nx integration

Do not block this migration on an unofficial Nx plugin.

As of the decision date, Nx has first-class plugins for Vite, React, Next, and
Expo in this repository, but not official Astro or Vike plugins. Community
Astro plugins exist, but they should not become foundational until evaluated in
this repo.

The researched community Astro options are:

- `@geekvetica/nx-astro@2.0.0`, current enough to evaluate in a spike.
- `@nxtensions/astro@19.0.1`, stale relative to Nx 23 and not a safe default.

Use explicit Nx `project.json` command targets around the framework CLIs:

```json
{
  "targets": {
    "serve": {
      "executor": "nx:run-commands",
      "options": {
        "command": "pnpm exec astro dev",
        "cwd": "apps/frontend/landing"
      }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "pnpm exec astro build",
        "cwd": "apps/frontend/landing"
      },
      "outputs": ["{workspaceRoot}/dist/apps/frontend/landing"]
    }
  }
}
```

Use the same pattern for Vike:

```json
{
  "targets": {
    "serve": {
      "executor": "nx:run-commands",
      "options": {
        "command": "pnpm exec vike dev",
        "cwd": "apps/frontend/site"
      }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "pnpm exec vike build",
        "cwd": "apps/frontend/site"
      },
      "outputs": ["{workspaceRoot}/dist/apps/frontend/site"]
    },
    "start": {
      "executor": "nx:run-commands",
      "dependsOn": ["build"],
      "options": {
        "command": "node dist/server/index.mjs",
        "cwd": "apps/frontend/site"
      }
    }
  }
}
```

The final command/output paths may change after the first scaffold. Keep the
targets explicit so existing Nx affected, cache, CI, and Docker tooling can see
the apps as normal projects.

## Shared code split

Before either SSR app grows, split the current web UI package:

```text
libs/
  common/design-tokens
  frontend/runtime
  frontend/api-client
  frontend/api-support
  frontend/feature/*/core
  frontend/ui-web
  frontend/ui-native
```

Rules:

- `frontend/feature/*/core` returns view models, commands, schemas, query keys,
  and data mappers. It must not import UI components, DOM APIs, Astro, Vike,
  Vite, Expo, or React Native.
- `frontend/runtime` owns i18n, query provider defaults, shell state, theme, and
  locale behavior. Runtime code must keep storage and document access guarded
  for SSR.
- `frontend/ui-web` owns DOM/React components for Astro islands and Vike pages.
- `frontend/ui-native` is the future Expo renderer and imports the same feature
  core, not the web UI.
- `@app/frontend-ui` can remain as a compatibility alias during migration, but
  new shared runtime code should not be added there.

## Deployment shape

Landing:

- Prefer static Astro output for marketing pages.
- Use `@astrojs/node` only for dynamic SSR landing requirements.
- Keep landing deployable independently from the authenticated site.

Site:

- Deploy as a Node SSR service.
- Use same-origin API proxying where possible so server and browser requests
  share auth/session behavior.
- Keep auth/session redirects in Vike server hooks or route guards, not in
  client-only effects.

Admin:

- Continue as a Vite SPA until there is a product reason to move it.

## Validation expectations

For landing framework changes:

```bash
pnpm exec nx build landing-app
pnpm exec nx run landing-app:e2e
pnpm run format:check
pnpm run frontend:fsd:check
git diff --check
```

For site framework changes:

```bash
pnpm exec nx build site-app
pnpm exec nx run site-app:e2e
pnpm run typecheck
pnpm run frontend:fsd:check
git diff --check
```

Adjust project names after scaffolding. If Astro/Vike app names replace the
current `landing-app` or `user-app`, update `docs/command-matrix.md`,
deployment docs, Docker targets, CI project lists, and smoke-test coverage in
the same migration.

## Source research

- Astro React integration: https://docs.astro.build/en/guides/integrations-guide/react/
- Astro Node adapter: https://docs.astro.build/en/guides/integrations-guide/node/
- Vike existing Vite migration: https://vike.dev/add
- Vike config and React SSR examples: https://vike.dev/config
- Vike data hook: https://vike.dev/data
- Vike server integration: https://vike.dev/server
