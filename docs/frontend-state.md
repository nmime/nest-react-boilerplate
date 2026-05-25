# Frontend state architecture

The frontend stack intentionally separates request state from client/UI shell state:

- **TanStack Query** owns server/request state: backend reads, mutations, loading and error lifecycles, retries, and query invalidation. User profiles, admin principals, lists, authenticated preference saves, and other server-fetched domain data should stay here.
- **MobX** owns observable client/UI shell state through `@app/frontend-ui` stores under `libs/frontend/ui/lib/src/lib/state/`: `LocaleStore`, `AuthShellStore`, `UiStore`, and the composed `RootStore` exposed by `FrontendStateProvider`. User/admin bearer-token shell state belongs in `AuthShellStore`; server-fetched session/profile data remains in TanStack Query.
- **React local state** remains fine for component-private transient details such as current form input, route snapshots, authenticated preference overrides, hover/disclosure flags, or one-off dialog fields.

`LocaleStore` is the bridge between i18n and API requests. It persists the selected locale, drives `FrontendI18nProvider`, updates `document.documentElement.lang`, and keeps `apiFetch` configured with a locale getter so every request receives the latest `Accept-Language` value at call time.

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
5. Keep guest fallback behavior local when no bearer token is available.

All backend calls from frontend app source and shared frontend libraries must use `apiFetch` or generated `@app/api-client` wrappers that call it; raw `fetch` is reserved for the shared API client implementation, tests, tooling, or e2e harnesses. `libs/frontend/ui/lib/src/lib/api/no-raw-fetch.spec.ts` enforces this across landing/user/admin/shared frontend source.

User-facing landing/user/admin copy, including aria labels, placeholders, fallback error text, card/stat labels, theme labels, and shared UI defaults, must be represented by typed translation keys instead of inline literals. `libs/frontend/ui/lib/src/lib/i18n/no-hardcoded-copy.spec.ts` statically scans React app/shared UI source for direct JSX text and user-facing string props/properties.
