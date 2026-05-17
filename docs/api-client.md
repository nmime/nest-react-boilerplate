# OpenAPI and typed client scaffold

OpenAPI is available when `OPENAPI_ENABLED=true`.

```bash
pnpm api:openapi -- --app auth-app-api --output docs/openapi/auth-app-api.json
pnpm api:client -- --input docs/openapi/auth-app-api.json --output libs/frontend/api-client/src/generated.ts
```

`api:openapi` starts the selected Nest API with OpenAPI enabled, downloads `/docs/openapi.json`, and stops the process. For `auth-app-api` it uses in-memory auth persistence to avoid a database requirement during export.

`api:client` uses `pnpm dlx openapi-typescript` so the boilerplate does not carry an extra dependency by default. Commit generated clients only after the consuming app and regeneration policy are agreed.
