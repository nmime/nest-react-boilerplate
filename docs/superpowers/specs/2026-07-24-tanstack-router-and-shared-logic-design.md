# TanStack Router migration + shared data/logic across app & mobile

Date: 2026-07-24
Status: Approved — implementing
Scope: `apps/frontend/app`, `apps/frontend/admin`, `apps/frontend/mobile`, `libs/frontend/feature/user/*`

## Problem

The SPA-style frontends route by hand:

- `app` — bespoke router in `src/app/router/user-router.tsx` (History API + `useSyncExternalStore` +
  global `document` click interception + string `switch` on `pathname`).
- `admin` — same pattern in `src/App.tsx` (`getBrowserPath` / `normalizeAdminPath` / `isUsersRoute`),
  ~13 routes with per-route permission fallbacks to `ForbiddenPage`.

By contrast `site` uses Vike, `landing` uses Astro, `mobile` uses `expo-router` — all real, file-based routers.
The hand-rolled routers have no route typing, no code-splitting, and duplicate navigation plumbing.

Separately, the user wants **data and business logic shared between `app` (web) and `mobile` (native)**.
Today all of `app`'s feature logic lives _inside the app_ (`apps/frontend/app/src/features/*`,
`entities/*`), so `mobile` cannot import it (apps may not depend on other apps).

## Decisions (locked with the user)

1. **Router library: TanStack Router**, used as a _pure router_ (no TanStack loaders; data stays in
   mobx-tanstack-query). Reverses nothing else about the stack.
2. **Route definition style: code-based**, authored in each app's FSD `app` layer (`src/app/router/`),
   importing page components from the `pages/*` public barrels. No file-based `routes/` dir, no
   `routeTree.gen.ts` — this keeps the strict FSD boundary specs intact.
3. **Scope: `app` + `admin`** migrate together to the same pattern.
4. **Keep the boilerplate's own stack**: MobX + mobx-tanstack-query + openapi-fetch + custom
   `frontend-ui-web`/`frontend-ui-native` + custom `frontend-runtime` i18n. i18next stays out.
   The in-house reference product (Refine + Ant Design + react-router v7 + axios, admin-only) is a
   **reference, not a mandate** — we do not adopt Refine/antd/react-router here.
5. **Reuse axis is data + logic, NOT navigation.** We do _not_ build a shared navigation abstraction
   (web TanStack Router and native expo-router cannot share router code, and that is fine). Instead we
   relocate the already-platform-agnostic `model/` + `api/` layers into shared libs both platforms import.

## Part A — Router (view layer only)

TanStack Router code-based tree per app. Providers (state/i18n/query/theme) stay **above** the router,
unchanged. Root is a **pathless layout route** rendering the app shell with `<Outlet/>`. `createRouter`
uses `createBrowserHistory()`; tests use `createMemoryHistory({ initialEntries })`. Router context carries
what pages currently receive as props.

Route components are **thin**: they render UI and pull all data/logic from shared libs (Part B). No
data fetching or business logic in route definitions.

### app route map (parity with today — `user-router.tsx`)

Pathless shell layout →

- `/` → `UserHomePage` (index content)
- `/auth` → `AuthPage`
- `/auth/discord/callback` → `AuthDiscordCallbackPage`
- `/auth/telegram/callback` → `AuthTelegramCallbackPage`
- `/profile` → `ProfilePage`
- `/settings` → `SettingsPage`
- `/tma` → `TmaPage`; aliases `/tma/auth`, `/telegram-mini-app` resolve to the same view
- `/link/telegram` → `TmaPage` (`fallbackStartParam="link_telegram"`)
- `/link/discord` → `SettingsPage`
- notFound → render `UserHomePage` (preserve today's "unknown route falls back to home")

Cleanup in scope: split `UserHomePage`'s dual role (it is _both_ the shell and the `/` content today)
into `UserShell` (layout: nav actions, back handling, `<Outlet/>`) + `UserHomePage` (index content).

### admin route map (parity with today — `App.tsx`)

Root auth gate (unauthenticated → `ForbiddenPage`). AdminLayout shell →

- `/` + `/dashboard` → `DashboardPage` (guard: dashboard)
- `/users` + `/users/$userId` → `UsersPage` (guard: users)
- `/roles` → `RolesPage` (guard: roles)
- `/audit` + `/audit/$` → `AuditPage` (guard: audit)
- `/auth/login-analytics` → `AuthLoginAnalyticsPage` (guard)
- `/profile` → `ProfilePage` (guard)
- `/settings/errors` → `ProblemPresentationsPage` (guard: settings)
- `/settings/feature-flags` → `FeatureFlagsPage` (guard: featureFlags)
- `/notifications/templates` → `NotificationTemplatesPage`
- `/notifications/segments` → `NotificationSegmentsPage`
- `/notifications/broadcasts` → `NotificationBroadcastsPage`
- notFound → `NotFoundPage`

Permission guards preserve current UX exactly: **in-place render of `ForbiddenPage`** when the access
check fails (not a redirect), via a small `guarded(Component, check, reasonKey)` wrapper or `beforeLoad`
reading router context.

### Navigation & links (both apps)

- Delete `app`'s global `document` click-interception effect — replaced by router `<Link>`.
- Internal `<a href="/…">` → `<Link to>`; injected `navigate` prop → `useNavigate()` in the pages.
- Back button → router history (`history.back()` / `canGoBack`).

### Router tests

Rewrite `admin` router specs and the `app` equivalents with `createMemoryHistory({ initialEntries })` +
`createRouter` + `RouterProvider`. Cover every route, each guard→Forbidden, alias resolution, and
notFound. Respect the binding coverage floors.

## Part B — Shared data/logic (the real goal)

`app`'s `features/*/model` + `features/*/api` and `entities/*/model` + `entities/*/api` import **no**
web-only code (verified: no `react-dom`, no `@app/frontend-ui-web`). They depend only on
`@app/frontend-api-client`, `@app/frontend-api-support`, `@app/frontend-runtime`. So they are already
platform-agnostic; the only blocker to reuse is their physical location inside the app.

**Move them into shared libs** under `libs/frontend/feature/user/` (which already hosts `i18n`). Each
new lib mirrors the `feature/user/i18n` scaffold (package `project.json` with `build` = `tsc --noEmit`
against `tsconfig.lib.json`, `tsconfig.json`, `tsconfig.lib.json`, `eslint.config.cjs`, `src/index.ts`
barrel using `export *`, README, AGENTS.md), registered in `tsconfig.base.json` paths.

New libs (name → moved contents):

- `@app/frontend-feature-user-auth` ← `features/auth/{model,api}`
- `@app/frontend-feature-user-social-auth` ← `features/social-auth/{model,api}`
- `@app/frontend-feature-user-tma-auth` ← `features/tma-auth/{model,api}`
- `@app/frontend-feature-user-preferences` ← `features/preferences/{model,api}`
- `@app/frontend-feature-user-logout` ← `features/logout/{model,api}`
- `@app/frontend-feature-user-profile` ← `entities/profile/{model,api}`

Rules:

- Only `model/` + `api/` move. The `ui/` slices stay in `app` (web) and get their logic via the new libs.
- Barrels use `export *` (project convention); collisions renamed at source.
- Tags mirror the i18n lib: `platform:frontend`, `type:feature-shared`, `scope:user`,
  `boundary:<feature>`, `fsd:layer:shared`, `framework:neutral`. Nx module-boundary tags must allow apps
  and other feature libs to depend on them.
- Co-located `*.spec.ts(x)` for `model`/`api` move with their code; coverage floors and the per-lib
  explicit `typecheck`/`build` target are added.
- Enforced principle: feature data/logic never lives inside an app. Extend the FSD boundary specs to
  assert `app`/`admin` `features/*` contain only `ui/` (no `model`/`api` that ought to be shared).

## Part C — Mobile reuse (demonstration)

Wire `mobile` to consume at least one shared model so reuse is proven, not just structural:

- `mobile` already imports `@app/frontend-runtime`; add a dependency on one new feature lib
  (e.g. `@app/frontend-feature-user-preferences` or `-auth`) and drive a native screen's state from the
  shared model, rendering with `@app/frontend-ui-native` (Tamagui). Keep the router as expo-router.

## Non-goals

SSR for `app`/`admin`; TanStack data loaders; file-based routing; adopting Refine/antd/react-router;
rewriting page internals beyond the `UserShell` split; per-route code-splitting (possible follow-up);
migrating `site`/`landing` (already have real routers).

## Execution phases (each independently green before the next)

0. Baseline: `pnpm install`; record current typecheck/lint/test state. (Worktree had no `node_modules`.)
1. Scaffold the 6 shared feature libs (empty barrels) + `tsconfig.base.json` paths + tags. Verify graph.
2. Extract logic feature-by-feature (auth → social-auth → tma-auth → preferences → logout → profile):
   move `model`+`api`+specs, update `app` imports to the new `@app/...` packages, keep tests green.
3. `app` → TanStack Router: add dep, build route tree, `UserShell` split, convert pages to thin views
   using `useNavigate`/`<Link>`, delete hand-rolled router + click interception, rewrite router tests.
4. `admin` → TanStack Router: add dep, build route tree with `guarded` wrappers + notFound, rewrite
   `admin-routing.spec`.
5. `mobile`: consume a shared model in a native screen.
6. Extend FSD boundary specs; final full verification.

## Verification gates (binding)

- `pnpm typecheck` (all projects — every project has an explicit typecheck target).
- `pnpm lint` clean.
- Affected `test` targets green with coverage floors met (re-run flaky suites in isolation before trusting
  a failure — admin root-render error-boundary 5s test and Testcontainers 30s are known-flaky under load).
- FSD boundary specs green in `app` and `admin`.
- Route parity: every legacy route/alias/guard behaves identically (asserted by rewritten router specs).
- New `@tanstack/react-router` dep satisfies pnpm `minimumReleaseAge` (1440 min) — use a stable version.

## Risks

- Route/alias/fallback parity — mitigated by preserving behavior in rewritten specs.
- Base path if an app is not served at `/` — use TanStack Router `basepath` if needed.
- Nx module-boundary tag rules may reject new dependency edges — update `depConstraints` alongside.
- Barrel export collisions when merging feature `model`/`api` into one lib barrel — rename at source.
