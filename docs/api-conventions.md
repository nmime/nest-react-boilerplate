# API conventions

The current backend consists of three standalone NestJS API shells:

- `backend-admin-app-api` at `apps/backend/admin-app-api`
- `user-app-api` at `apps/backend/user-app-api`
- `auth-app-api` at `apps/backend/auth-app-api`

Each app is intentionally minimal and safe to run without external infrastructure.

## Health endpoints

Every backend app exposes:

```http
GET /health
```

The response is wrapped by the shared response helper:

```json
{
  "data": {
    "app": "backend-admin-app-api",
    "status": "ok"
  }
}
```

The exact `app` value changes per API.

## Validation baseline

`libs/common/validation` exposes `createProblemValidationPipe()`. The pipe enables:

- `transform: true`
- `whitelist: true`
- `forbidNonWhitelisted: true`

Validation failures are shaped as problem-style error bodies with a stable status and error list.

## Bootstrap and security baseline

`libs/common/bootstrap` exposes `bootstrapNestApi()`. It applies:

- Helmet security middleware
- the shared strict validation pipe
- CORS-ready defaults that can be narrowed by app configuration
- configurable default ports with no hardcoded secrets

## Response and result boundaries

`libs/common/response` exposes helpers for success and problem responses. It also maps `neverthrow` `Result<T, E>` values into API responses, keeping application/service outcomes explicit at HTTP boundaries.

Use this pattern for new backend features:

1. Keep domain or service logic explicit about success/failure with `Result` or `ResultAsync`.
2. Convert that result at the controller boundary.
3. Return stable response shapes from controllers.

## OAuth/OIDC shell

`libs/features/auth/oauth` provides an OAuth/OIDC-ready service using `openid-client` and `neverthrow` `ResultAsync`.

Defaults are safe:

- OAuth is disabled unless configured.
- No secrets are required for tests or local startup.
- Tests do not make live network calls.
- Callback exchange is represented as a boundary to configure when a real provider is added.

## Testing

Backend tests include:

- controller-level health smoke tests
- HTTP e2e health smoke tests using Nest testing utilities and `supertest`
- validation helper tests
- response helper tests
- OAuth service tests without external providers

Run all backend tests with:

```bash
pnpm exec nx run-many -t test --projects=backend-admin-app-api,user-app-api,auth-app-api,@app/common/validation,@app/common/response,@app/features-auth-oauth
```
