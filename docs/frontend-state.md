# Frontend state architecture

The frontend stack intentionally separates request state from client/UI shell state:

- **TanStack Query** owns server/request state: backend reads, mutations, loading and error lifecycles, retries, and query invalidation. User profiles, admin principals, lists, and other server-fetched domain data should stay here.
- **MobX** owns observable client/UI shell state through `@app/frontend-ui` stores under `libs/frontend/ui/src/lib/state/`: `LocaleStore`, `AuthShellStore`, `UiStore`, and the composed `RootStore` exposed by `FrontendStateProvider`.
- **React local state** remains fine for component-private transient details such as current form input, hover/disclosure flags, or one-off dialog fields.

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

All backend calls from app/admin source must use `apiFetch`; raw `fetch` is reserved for tests, tooling, or e2e harnesses.
