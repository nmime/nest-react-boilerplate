# Type-safe frontend API clients

Frontend clients use the same stack as the modern xrocket frontend:
`openapi-typescript` generates static contract types, `openapi-fetch` executes typed REST calls, and `openapi-react-query` supplies typed TanStack Query option builders.

```bash
pnpm api:openapi -- --app auth-app-api --output docs/openapi/auth-app-api.json
pnpm api:openapi -- --app user-app-api --output docs/openapi/user-app-api.json
pnpm api:openapi -- --app backend-admin-app-api --output docs/openapi/admin-app-api.json
pnpm api:clients
pnpm api:clients:check
```

Checked-in generated artifacts live at:

- `libs/frontend/api-client/src/generated/auth.ts`
- `libs/frontend/api-client/src/generated/user.ts`
- `libs/frontend/api-client/src/generated/admin.ts`

`@app/api-client` wraps those generated `paths/components/operations` types in service modules exported as `authApi`, `userApi`, and `adminApi`. Apps import DTOs, success payload aliases, typed error aliases, query keys/options, and mutation/query helpers from those namespaces instead of importing contracts directly or embedding endpoint path strings.

Runtime calls return the native `openapi-fetch` envelope `{ data, error, response }`; non-2xx HTTP responses do not throw unless callers explicitly use `throwOnOpenApiError` / `throwOnOpenApiErrorData`. Those helpers throw `ApiClientError<TError>` with `status`, typed `body`, and the original `Response`. Locale, bearer token, `Accept`, `Accept-Language`, and base URL behavior remain centralized through the frontend UI API header helpers.

## Auth preference wrappers

The auth client exposes generated-contract-backed wrappers for both preference routes:

- `authControllerUpdatePreferences(body, options)` calls `PATCH /auth/me/preferences` with a partial `{ locale?: "en" | "es"; theme?: "system" | "light" | "dark" }` body and returns the updated authenticated user view envelope.
- `authControllerUpdateLocale(body, options)` remains available for compatibility with callers that only update locale.
- `getAuthControllerUpdatePreferencesMutationKey()` and `useAuthControllerUpdatePreferencesMutation()` provide the TanStack Query mutation key and hook shape used by app/admin authenticated preference flows.

User and admin apps should call these `authApi` helpers and pass `authToken` plus the configured auth API base URL through the wrapper options. Do not duplicate `/auth/me/preferences` strings, request envelopes, or bearer/locale header construction in app code.

When backend routes, DTOs, response wrappers, auth metadata, or error decorators change:

1. Regenerate OpenAPI/contracts with `pnpm api:contracts` if the backend spec changed.
2. Regenerate frontend client types with `pnpm api:clients`.
3. Commit both OpenAPI/contract output and frontend generated artifacts.
4. Update wrapper aliases/hooks in `libs/frontend/api-client/src/auth.ts` when a route becomes app-facing.
5. Run `pnpm api:contracts:check`, `pnpm api:clients:check`, and affected app/client tests or `pnpm run check` before opening a PR.

Treat generated files as read-only; fix controllers, Swagger metadata, or the generator script and regenerate. Orval config/mutators are no longer part of the client architecture.
