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
- strict validation with transform, whitelist, and forbid-non-whitelisted settings
- CORS from explicit app options or `CORS_ORIGINS`/`CORS_ORIGIN`
- production CORS that does not reflect arbitrary origins when no origin is configured

## Result responses

`libs/common/response` exposes helpers for:

- `{ data }` success responses
- `{ error: { code, message } }` problem responses
- mapping `neverthrow` results to API responses

## OAuth foundation

`libs/features/auth/oauth` is disabled by default. It can build local authorization URLs from explicit configuration, but callback exchange is intentionally left for product-specific provider wiring.

## Auth endpoints

`auth-app-api` exposes:

```http
POST /auth/register
POST /auth/login
GET /auth/me
POST /auth/logout
```

Register/login accept JSON `{ "email": "user@example.com", "password": "password123", "displayName": "User" }` (display name is optional for login). Successful responses return `{ data: { user, accessToken, tokenType: "Bearer", expiresIn } }`. Use the bearer token against `GET /profile/me` on `user-app-api` and `GET /admin/profile/me` on `backend-admin-app-api`.

Admin access is fail-closed. A registered email listed in `ADMIN_BOOTSTRAP_EMAILS` receives `admin` role plus `admin:read`, `admin:profile:read`, and `admin:dashboard:read` permissions.
