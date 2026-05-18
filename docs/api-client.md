# OpenAPI generated API clients

OpenAPI is available when `OPENAPI_ENABLED=true`. The committed frontend client is generated per backend service with Orval from the reviewed specs in `docs/openapi/`.

```bash
pnpm api:openapi -- --app auth-app-api --output docs/openapi/auth-app-api.json
pnpm api:openapi -- --app user-app-api --output docs/openapi/user-app-api.json
pnpm api:openapi -- --app backend-admin-app-api --output docs/openapi/admin-app-api.json
pnpm api:clients
pnpm api:clients:check
```

Generated clients live under `libs/frontend/api-client/src/generated/{auth,user,admin}` and are re-exported from `@app/api-client` as `authApi`, `userApi`, and `adminApi`. Each service owns its endpoint functions and TanStack Query query-key/options helpers.

All generated endpoint functions call the custom Orval mutator in `libs/frontend/api-client/src/api-client-mutator.ts`, which delegates to the shared `apiFetch` transport. This keeps bearer token, JSON, error, base URL, and `Accept-Language` behavior centralized.

When controller routes, DTOs, response wrappers, or auth/error decorators change:

1. Regenerate OpenAPI/contracts with `pnpm api:contracts` if the backend spec changed.
2. Regenerate clients with `pnpm api:clients`.
3. Commit both OpenAPI/contract output and API client output.
4. Run `pnpm api:clients:check` or `pnpm run check` before opening a PR.

Treat generated files as read-only; fix controllers, OpenAPI metadata, or `orval.config.mjs` and regenerate instead of editing generated code manually.
