# Frontend SSR framework strategy

Status: accepted with separate ownership for every frontend runtime.

Date: 2026-07-02.

## Decision

Use two SSR-capable web app targets with different ownership boundaries:

- `landing-app` at `apps/frontend/landing`: Astro with React islands.
- `site-app` at `apps/frontend/site`: Vike with React SSR for a distinct
  product/site surface when SSR is required.
- `user-app` at `apps/frontend/app`: Vite with React for the authenticated
  user application.
- `admin-app` at `apps/frontend/admin`: keep the existing Vite React SPA unless
  admin SEO, first-load SSR, or server auth gates become product requirements.

This resolves the framework choice as Astro for landing, Vike for a distinct
SSR product/site surface, and Vite for the authenticated user and admin
applications. None of these is a repository default. Do not introduce Next.js
for these surfaces unless Vike fails a repo-local proof of authenticated SSR,
route guards, and deployment.

The final shared UI Nx project names and canonical aliases are split by
platform. These package-style flattened names are the source import aliases and
Nx project names:
`@app/frontend-ui-web`, `@app/frontend-ui-native`, `@app/frontend-runtime`, and
`@app/common-design-tokens`.

- `@app/frontend-ui-web` at `libs/frontend/ui-web/lib`: shadcn-style React DOM
  components for Astro, Vike, and admin web.
- `@app/frontend-ui-native` at `libs/frontend/ui-native/lib`: Tamagui
  components for Expo/React Native.
- `@app/frontend-runtime` at `libs/frontend/runtime/lib`: non-visual web runtime
  concerns such as i18n, query defaults, shell state, theme, and locale
  behavior.
- Shared feature core must sit below both renderers and must not import either
  UI package.

This is intentionally not a single universal framework choice. Landing and the
authenticated site have different runtime needs:

- Landing is content and SEO first. It should ship static or mostly static HTML,
  hydrate only the interactive React islands it needs, and support MDX/content
  workflows.
- Site is SSR first. It needs server-side data loading, redirects, route guards,
  and app shell state when a product has a separately owned SSR surface.

## Why Astro for landing

Astro is the correct default for the marketing/landing surface because it is
content oriented and React is optional per island instead of making the whole
page a React application.

Use the current package baseline:

- `astro@7.0.9`
- `@astrojs/react@6.0.1`
- `@astrojs/mdx@7.0.2` when docs, changelog pages, pricing copy, or long-form
  content become part of the landing surface.
- `@astrojs/sitemap@3.7.3` for sitemap generation.
- `@astrojs/node@11.0.2` only when landing needs on-demand rendering, sessions,
  server islands, or Node deployment. Static output remains preferred when the
  page can be pre-rendered.

Landing React islands may import shared frontend runtime contracts and
frontend-safe feature core, but Astro pages must not become thin wrappers around
the old SPA. Prefer `.astro` pages, content collections, and small React islands
for interactive pieces such as locale/theme switchers, auth CTAs, calculators,
or demos.

## Why Vike for site

Vike is the better fit for the SSR product/site surface than Astro
because it keeps the current Vite/React mental model while adding SSR, data
loading, route configuration, and server integration.

Use the current package baseline:

- `vike@0.4.260`
- `vike-react@0.6.25`
- `@vikejs/fastify@0.2.5` for the Node/Fastify server adapter, matching the
  backend preference for Fastify.

Site pages should use Vike page files and Vike server data hooks for initial
SSR data. Client-side TanStack Query can still own live refetching, mutations,
and cache updates after hydration.

The site is its own app boundary, not a hidden mutation or automatic
replacement of `user-app`. Share route-independent runtime and business logic
through `@app/frontend-runtime` and feature-core libraries, while keeping
routing, server data hooks, deployment, and domains app-owned.

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
        "command": "NODE_ENV=production node --experimental-strip-types server/index.ts",
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
  frontend/ui-web/lib
  frontend/ui-native/lib
```

Rules:

- `frontend/feature/*/core` returns view models, commands, schemas, query keys,
  and data mappers. It must not import UI components, DOM APIs, Astro, Vike,
  Vite, Expo, or React Native.
- `frontend/runtime` owns i18n, query provider defaults, shell state, theme, and
  locale behavior. Runtime code must keep storage and document access guarded
  for SSR.
- `@app/frontend-ui-web` owns DOM/React components for Astro islands and Vike
  pages.
- `@app/frontend-ui-native` is the Expo renderer consumed by `mobile-app` and
  imports the same feature core, not the web UI.
- `@app/frontend-ui` can remain as a compatibility alias
  during migration, but new shared runtime code should not be added there.

## UI renderer split

Web UI uses shadcn-style open component code. In this repository that means the
owned `@app/frontend-ui-web` package keeps the component source and uses the
same web primitives already present in the current UI layer: Tailwind CSS,
Radix primitives, `class-variance-authority`, `tailwind-merge`, and React DOM.

`@app/frontend-ui-web` is consumed by:

- Astro React islands in `apps/frontend/landing`.
- Vike React SSR pages in `apps/frontend/site`.
- The existing Vite admin SPA in `apps/frontend/admin`.

Native UI uses Tamagui in `@app/frontend-ui-native` and the Expo app at
`apps/frontend/mobile`. Tamagui is the native renderer choice because it gives
Expo/React Native components, theming, and a compiler path without forcing the
web apps to abandon their
shadcn/Radix/Tailwind component model.

Do not mix the renderers:

- `@app/frontend-ui-web` must not import Tamagui, Expo, or React Native.
- `@app/frontend-ui-native` must not import shadcn/Radix DOM components.
- `frontend/feature/*/core` must not import either UI renderer.

Design consistency comes from shared design tokens, not from sharing component
implementations. The token package should expose CSS variables for shadcn/web
and a Tamagui theme/config adapter for native.

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

For Astro landing changes:

```bash
pnpm exec nx build landing-app
pnpm exec nx run landing-app:e2e
pnpm run frontend:fsd:check
```

For Vike site changes:

```bash
pnpm exec nx build site-app
pnpm exec nx run site-app:e2e
pnpm run typecheck
pnpm run frontend:fsd:check
```

For shared design-token or runtime changes:

```bash
pnpm exec nx run @app/common-design-tokens:build
pnpm exec nx run @app/frontend-runtime:build
pnpm run frontend:fsd:check
```

For shadcn `ui-web` changes:

```bash
pnpm exec nx run @app/frontend-ui-web:build
pnpm run frontend:fsd:check
```

Storybook still uses the compatibility config under `libs/frontend/ui/lib`, but
it loads stories and styles from `@app/frontend-ui-web`. Run Storybook gates for
web UI changes until a dedicated `ui-web` Storybook target replaces that config
shell.

For Tamagui `ui-native` changes:

```bash
pnpm exec nx run @app/frontend-ui-native:build
pnpm run frontend:fsd:check
```

For every docs/config migration patch, also run:

```bash
pnpm run format:check
git diff --check
```

These target names are final for the migration plan. When scaffolding lands,
update `docs/command-matrix.md`, deployment docs, Docker targets, CI project
lists, and smoke-test coverage in the same migration.

## Source research

- Astro React integration: https://docs.astro.build/en/guides/integrations-guide/react/
- Astro Node adapter: https://docs.astro.build/en/guides/integrations-guide/node/
- Vike existing Vite migration: https://vike.dev/add
- Vike config and React SSR examples: https://vike.dev/config
- Vike data hook: https://vike.dev/data
- Vike server integration: https://vike.dev/server
