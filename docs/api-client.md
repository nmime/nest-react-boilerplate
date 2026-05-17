# OpenAPI and typed client scaffold

OpenAPI is available when `OPENAPI_ENABLED=true`.

```bash
pnpm api:openapi -- --app auth-app-api --output docs/openapi/auth-app-api.json
pnpm api:client -- --input docs/openapi/auth-app-api.json --output libs/frontend/api-client/src/generated.ts
```

`api:openapi` starts the selected Nest API with OpenAPI enabled, downloads `/docs/openapi.json`, and stops the process. For `auth-app-api` it uses in-memory auth persistence to avoid a database requirement during export.

`api:client` uses `pnpm dlx openapi-typescript` so the boilerplate does not carry an extra dependency by default. Commit generated clients only after the consuming app and regeneration policy are agreed.

## Frontend API client and TanStack Query

The user and admin React apps use `@tanstack/react-query` for server state. Shared request helpers live in `libs/frontend/api-client` so profile queries, auth mutations, locale persistence, and API error formatting all pass through the same `apiFetch` wrapper.

`apiFetch` sets `Accept`/`Accept-Language` headers, JSON-serializes plain request bodies, normalizes API base URLs, and unwraps JSON payloads before app-level code reads `data`. The raw fetch guard and API client tests in that library lock down the behavior without requiring browser e2e coverage for every header combination.

When adding new frontend API integrations, prefer shared client helpers plus `useQuery`/`useMutation` over ad-hoc `useEffect` fetch chains or client-side state managers. MobX is intentionally not part of this boilerplate.
