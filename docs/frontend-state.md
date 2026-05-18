# Frontend state architecture

The frontend stack intentionally separates request state from client/UI shell state:

- **TanStack Query** owns server/request state: backend reads, mutations, loading and error lifecycles, retries, and query invalidation. User profiles, admin principals, lists, and other server-fetched domain data should stay here.
- **MobX** owns observable client/UI shell state through `@app/frontend-ui` stores under `libs/frontend/ui/src/lib/state/`: `LocaleStore`, `AuthShellStore`, `UiStore`, and the composed `RootStore` exposed by `FrontendStateProvider`. User/admin bearer-token shell state belongs in `AuthShellStore`; server-fetched session/profile data remains in TanStack Query.
- **React local state** remains fine for component-private transient details such as current form input, route snapshots, authenticated-locale overrides, hover/disclosure flags, or one-off dialog fields.

`LocaleStore` is the bridge between i18n and API requests. It persists the selected locale, drives `FrontendI18nProvider`, and keeps `apiFetch` configured with a locale getter so every request receives the latest `Accept-Language` value at call time.

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

Use `observer` only on components that directly read observable store properties. Components that read translated strings through `useI18n()` can rely on the i18n context unless they also read stores directly.

All backend calls from frontend app source and shared frontend libraries must use `apiFetch`; raw `fetch` is reserved for the shared API client implementation, tests, tooling, or e2e harnesses. `libs/frontend/ui/src/lib/api/no-raw-fetch.spec.ts` enforces this across landing/user/admin/shared frontend source.

User-facing landing/user/admin copy, including aria labels, placeholders, fallback error text, card/stat labels, and shared UI defaults, must be represented by typed translation keys instead of inline literals. `libs/frontend/ui/src/lib/i18n/no-hardcoded-copy.spec.ts` statically scans React app/shared UI source for direct JSX text and user-facing string props/properties.

`UiStore` is intentionally retained for future cross-route UI shell state (sidebar, modal, theme). It is not wired into product pages only to prove existence; the MobX state-provider tests cover it as client-only shell state and protect the boundary that server data stays in TanStack Query.
