# API conventions

The backend consists of three standalone NestJS API shells:

- `backend-admin-app-api`
- `user-app-api`
- `auth-app-api`

## Health

Each service exposes:

```http
GET /health
```

The response shape is:

```json
{
  "data": {
    "app": "service-name",
    "status": "ok"
  }
}
```

## Bootstrap and security baseline

`libs/common/bootstrap` exposes `bootstrapNestApi()`. It applies:

- Helmet security middleware
- raw request-body capture for webhook/signature use cases
- cookie parsing from `COOKIE_SECRET`
- deny-all `robots.txt` responses
- extended query parsing and trust-proxy configuration
- request IDs and structured completion logs
- strict `ProblemValidationPipe` validation with transform, whitelist, and forbid-non-whitelisted settings
- `ProblemResponseTransformer` and `ProblemExceptionFilter` response mapping
- CORS from explicit app options or `CORS_ORIGINS`/`CORS_ORIGIN`
- production CORS that does not reflect arbitrary origins when no origin is configured
- optional Swagger/OpenAPI docs from `libs/common/swagger`

## Result responses and problem details

`libs/common/response` exposes the response mapper layer for:

- `{ data }` success responses
- RFC 7807 `application/problem+json` problem responses
- mapping `neverthrow` results to API responses
- global `ProblemResponseTransformer` and `ProblemExceptionFilter` wiring from bootstrap

`libs/common/exception` exposes `BaseException`, the `Exception` factory, problem status mapping, and `ApiProblemExceptions` for OpenAPI problem responses.

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
