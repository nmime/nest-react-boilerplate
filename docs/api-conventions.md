# API conventions

The backend consists of three standalone NestJS API shells:

- `backend-admin-app-api`
- `user-app-api`
- `auth-app-api`

## Health

All APIs use the shared health library `@app/common/health` at `libs/backend/common/health/lib`. App shells provide app-specific health providers/config through `apps/backend/*/src/health.config.ts`; the shared `BaseHealthController` and `HealthService` own the endpoint set and common response shaping.

```http
GET /health
GET /health/private
GET /live
GET /ready
```

`GET /health` is the compatibility/raw health response. It is intentionally not wrapped in `{ "data": ... }`:

```json
{
  "status": "ok",
  "uptime": 12.3,
  "timestamp": "2026-01-01T00:00:00.000Z",
  "checks": []
}
```

`GET /live`, `GET /ready`, and `GET /health/private` return the shared envelope shape:

```json
{
  "data": {
    "app": "auth-app-api",
    "status": "ok",
    "uptime": 12.3,
    "timestamp": "2026-01-01T00:00:00.000Z",
    "dependencies": [],
    "checks": []
  }
}
```

Checks can include `name`, `status`, `required`, `durationMs`, and sanitized `details`. `/ready` returns HTTP 503 when any required readiness indicator reports `error`; optional skipped indicators can still produce an overall `ok` response. `/health/private` is guarded by the private-network health guard.

Probe policy:

- local development Compose (`docker/docker-compose.yml`) uses API `/health`;
- production Compose (`docker/docker-compose.prod.yml`) uses API `/ready`;
- Helm API workloads use `/live` and `/ready`;
- frontend nginx containers use `/nginx-health`.

## Bootstrap and security baseline

`libs/backend/common/bootstrap` exposes `bootstrapNestApi()`. It applies:

- Helmet security middleware
- raw request-body capture for webhook/signature use cases
- cookie parsing from `COOKIE_SECRET`
- deny-all `robots.txt` responses
- extended query parsing and trust-proxy configuration
- request IDs and structured completion logs
- strict `createValidationPipe` validation with transform, whitelist, and forbid-non-whitelisted settings
- `ExceptionsResponseTransformer` and `ExceptionsFilter` response mapping
- CORS from explicit app options or `CORS_ORIGINS`/`CORS_ORIGIN`
- production CORS that does not reflect arbitrary origins when no origin is configured
- optional Swagger/OpenAPI docs from `libs/backend/common/swagger`

## Result responses and RFC 9457 Problem Details

`libs/backend/common/response` exposes the response mapper layer for:

- `{ data }` success responses
- RFC 9457 `application/problem+json` problem responses
- mapping `neverthrow` results to API responses
- global `ExceptionsResponseTransformer` and `ExceptionsFilter` wiring from bootstrap

`libs/backend/common/exception` is the singular exception foundation. Its public alias is `@app/common/exception`, its path is `libs/backend/common/exception/lib`, and its Nx project name is `@app/common/exception`. Do not add an alternate exception library alias or path.

Problem Details responses preserve RFC 9457 wire fields: `type`, `title`, `status`, `detail`, and `instance`. Repository problem types use stable `urn:problem:*` values via the shared `ProblemDetails`/`BaseException` path. Validation responses use the `errors[]` extension; each issue carries a field `detail` and JSON Pointer `pointer` when available. Human-readable `title`/`detail` localization supports `en` and `ru` with fallback `en`; client logic should rely on stable status/code/type data rather than localized text.

## Contracts and generated clients

OpenAPI JSON is committed under `libs/common/api-contracts/openapi/*.json`. Shared generated contract types live under `libs/common/api-contracts/lib/src/generated`, and generated frontend clients live under `libs/frontend/api-client/lib/src/generated`. API surface changes must update the source API, exported OpenAPI JSON, shared contracts, and frontend clients together.

## OAuth foundation

`libs/backend/feature/auth/shared` OAuth support is disabled by default. It can build local authorization URLs from explicit configuration, but callback exchange is intentionally left for product-specific provider wiring.

## Auth endpoints

`auth-app-api` exposes:

```http
POST /auth/register
POST /auth/login
GET /auth/me
POST /auth/logout
```

Register/login accept JSON `{ "email": "user@example.com", "password": "password123", "displayName": "User" }` (display name is optional for login). Successful responses return `{ data: { user, accessToken, tokenType: "Bearer", expiresIn } }`. Use the bearer token against `GET /profile/me` on `user-app-api` and `GET /admin/profile/me` on `backend-admin-app-api`.

Admin access is fail-closed. A registered email listed in `ADMIN_BOOTSTRAP_EMAILS` receives the `admin` role plus granular `admin:profile:read` and `admin:dashboard:read` permissions.
