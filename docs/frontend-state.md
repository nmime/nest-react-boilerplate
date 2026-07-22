# Frontend state architecture

The frontend stack intentionally separates request state from client/UI shell state. The declared stack is **MobX + mobx-tanstack-query (MobXQuery) + openapi-fetch**:

- **TanStack Query** is the underlying server/request-state engine: it owns the query cache, backend reads, mutations, loading and error lifecycles, retries, and query invalidation.
- **MobXQuery** (`createMobxQuery` / `createMobxMutation` from `@app/frontend-runtime`, wrapping `mobx-tanstack-query`) is how server state reaches the UI when it is naturally owned by a feature **model** and shared across `observer` components — it wraps a TanStack `Query`/`Mutation` and exposes `data`/`isLoading`/`error`/`isPending` as MobX observables. React-hook TanStack Query (`useQuery`/`useMutation`) remains the second, equally-supported access mode for request state that is tightly coupled to a component or route. See [Server state: MobXQuery vs React-hook TanStack Query](#server-state-mobxquery-vs-react-hook-tanstack-query) for which to pick.
- **MobX** owns observable client/UI shell state through `@app/frontend-runtime` stores under `libs/frontend/runtime/lib/src/state/`: `AppStore` (app status, viewport width, and breakpoint shell state), `LocaleStore`, `AuthShellStore`, `UiStore`, and the composed `RootStore` exposed by `FrontendStateProvider`. `AuthShellStore` records only whether session state is unknown, authenticated, or guest. It never stores credentials; user and admin apps use the same HttpOnly cookie session. Server-fetched session/profile data stays in the TanStack Query cache.
- **React local state** remains fine for component-private transient details such as current form input, route snapshots, authenticated preference overrides, hover/disclosure flags, or one-off dialog fields.
- **openapi-fetch** generated clients in `@app/frontend-api-client` (plus their `get*QueryKey` / `use*` wrappers) stay the single source of endpoint truth for every mode. Query functions call the generated wrappers; models never hardcode paths.

## Server state: MobXQuery vs React-hook TanStack Query

Both modes read and write the **same** TanStack Query cache, so invalidations cross between them freely. The choice is about _ownership_, not about which cache holds the data:

- **Use MobXQuery** (`createMobxQuery` / `createMobxMutation` inside a MobX model) when the server state is account/session-scoped, benefits from living outside a single component's render tree, and is consumed by `observer` components. The model is created with the **active** `useQueryClient()` (not the module-level `frontendQueryClient` default) so its cache and invalidations stay unified with the rest of the tree, and it is disposed via `model.destroy()` on unmount. Adopted flows:
  - `apps/frontend/app/src/features/social-auth` — `ProviderIdentitiesModel` owns the linked-identities list query and the unlink mutation (which invalidates the same query key it reads). The panel is a pure `observer`.
  - `apps/frontend/app/src/features/logout` — `LogoutModel` owns the sign-out mutation; see [User-facing sign-out](#user-facing-sign-out).
- **Use React-hook TanStack Query** (`useQuery` / `useMutation`) when request state is intrinsically coupled to React lifecycle or route context — effects that apply results to shell stores, navigation, `returnUrl` handling, or dense per-page local UI state. Deliberately kept on hooks (converting them would add model/lifecycle complexity with no architectural gain, since the state is component/route-scoped, not app-wide observable state):
  - The auth session + login/register flow (`features/auth/model/use-auth-session-flow.ts`): locale/theme `useEffect`s, navigation, `returnUrl`, and session-keyed `authMe`/`profile` queries, all covered by strict fetch-ordering integration specs.
  - Authenticated preference synchronization (`features/preferences`).
  - All admin pages (`apps/frontend/admin/src/pages/{users,roles,audit}`): filters, pagination, dialogs, and row selection are React local state interleaved with page-scoped queries and mutations.

Both `createMobxQuery` and `createMobxMutation` have live call sites; there are no dead server-state exports.

## User-facing sign-out

`features/logout` exposes `LogoutModel` / `useLogout` / `LogoutButton`. Sign-out is placed with the account preferences and only renders for an authenticated session. The flow: (1) call `POST /auth/logout` through the generated `authControllerLogout` wrapper with cookie credentials; (2) clear `AuthShellStore` session state and the API-support auth-required flag **even if the request fails**; (3) invalidate the `/auth/me`, `/profile/me`, and `/auth/provider-identities` query keys; (4) navigate to `/auth`.

`LocaleStore` is the bridge between i18n and API requests. It persists the selected locale, drives `FrontendI18nProvider`, updates `document.documentElement.lang`, and app providers pass the active locale into `@app/frontend-api-support` so every request receives the latest `Accept-Language` value at call time. The request implementation lives in API support so generated SDK code does not depend on React UI.

`UiStore` owns the active theme preference. It validates any `boilerplate.theme` value from `localStorage`, defaults to `system`, writes `data-theme-preference` with the saved preference, writes `data-theme` with the resolved `light` or `dark` value, and subscribes to `prefers-color-scheme` changes while the preference is `system`. Storage and DOM access are guarded so SSR, tests, and restricted browser storage keep working.

Provider order in applications should keep MobX near the other app-wide providers:

```tsx
<FrontendStateProvider>
  <FrontendQueryProvider>
    <FrontendI18nProvider>
      <App />
    </FrontendI18nProvider>
  </FrontendQueryProvider>
</FrontendStateProvider>
```

Use `observer` only on components that directly read observable store properties. Components that read translated strings, locale, or theme through `useI18n()` can rely on the i18n context unless they also read stores directly.

## Authenticated preference synchronization

Guests persist locale/theme locally and apply changes immediately. Authenticated app/admin shells hydrate saved values from `GET /auth/me` or profile payloads, apply them to `LocaleStore`/`UiStore`, and save user changes through the generated `authApi.authControllerUpdatePreferences` mutation. Successful mutation responses are used as the source of truth when the backend returns normalized locale or theme values.

Keep server ownership clear:

1. Read authenticated user/profile data with TanStack Query.
2. Apply returned `locale` and `theme` into the MobX shell stores.
3. Save preference changes with generated API-client mutations.
4. Invalidate or update relevant auth/profile query keys after successful saves.
5. Keep guest fallback behavior local when no authenticated session is available.

All backend calls from frontend app source and shared frontend libraries must use `apiFetch` from `@app/frontend-api-support` or generated `@app/frontend-api-client` wrappers that use API support. Raw `fetch` is reserved for the API-support implementation, tests, tooling, or e2e harnesses. `libs/frontend/api-support/lib/src/no-raw-fetch.spec.ts` enforces this across landing/user/admin/site/shared frontend source and allows raw fetch only in the API-support implementation plus ignored test files.

User-facing landing/user/admin/site copy, including aria labels, placeholders, fallback error text, card/stat labels, theme labels, and shared UI defaults, must be represented by typed translation keys instead of inline literals. `libs/frontend/ui-web/lib/src/no-hardcoded-copy.spec.ts` statically scans React app/shared UI source for direct JSX text and user-facing string props/properties.

## State/request topology

```mermaid
flowchart TD
  App[Frontend app shell]
  StateProvider[FrontendStateProvider<br/>MobX RootStore]
  QueryProvider[FrontendQueryProvider<br/>TanStack Query]
  I18nProvider[FrontendI18nProvider]
  ApiClient[@app/frontend-api-client wrappers]
  ApiSupport[@app/frontend-api-support apiFetch]
  Backend[Backend APIs]
  App --> StateProvider --> QueryProvider --> I18nProvider
  App --> ApiClient
  QueryProvider --> ApiClient
  ApiClient --> ApiSupport --> Backend
  App --> ApiSupport
```

The TanStack Query cache remains the request-state engine — accessed either through MobXQuery models (`createMobxQuery`/`createMobxMutation`) or React-hook `useQuery`/`useMutation`, both sharing one client; MobX stores own client/UI shell state; generated API-client wrappers stay the single source of endpoint truth and synchronize authenticated preferences back to the backend.
