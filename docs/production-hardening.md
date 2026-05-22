# Production hardening guide

This boilerplate ships with conservative production defaults for the Nest APIs and an explicit environment contract.

## Security defaults

- `helmet()` is enabled for every API at bootstrap.
- Request validation uses transform, whitelist, and forbid-non-whitelisted settings.
- Production CORS does **not** reflect arbitrary origins. Set `CORS_ORIGINS` to a comma-separated allow-list.
- Frontend nginx CSP permits API connections only to same-origin proxy routes or to the documented split-origin API hosts: `https://auth.example.com`, `https://api.example.com`, and `https://admin-api.example.com`.
- Production rate limiting is enabled by default unless `RATE_LIMIT_ENABLED=false` or an explicit `rateLimit.enabled: false` option disables it.
- `TRUST_PROXY` defaults to `false`; only set it to a known proxy configuration for trusted load balancers or ingress tiers.
- Shutdown hooks are enabled for graceful termination.
- Every request receives or preserves an `x-request-id` header.
- Completion logs are structured JSON and include only `appName`, `requestId`, `method`, `path`, `status`, and `durationMs`.

## Auth and RBAC

The auth feature exports reusable access-control primitives:

- `BearerAuthGuard` verifies HMAC JWT bearer tokens with `AUTH_JWT_SECRET`.
- `AUTH_JWT_ISSUER` and `AUTH_JWT_AUDIENCE` are optional but should be set in production.
- `RbacGuard` enforces `@RequireRoles()` and `@RequirePermissions()` metadata.
- Role checks are any-of; permission checks require all listed permissions.
- `@Public()` can mark health or intentionally anonymous routes.
- `@CurrentUser()` reads the verified principal attached to `request.user` and `request.auth`.

JWTs must not use `alg:none`. Unsupported algorithms, bad signatures, expired tokens, future `nbf` tokens, and issuer/audience mismatches are rejected.

## Rate limiting and proxy trust

The bootstrap layer includes a simple in-memory limiter for small deployments and tests. It defaults to **on in production** and **off outside production** unless `RATE_LIMIT_ENABLED` or `options.rateLimit.enabled` is explicitly set:

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

The limiter key is derived from Fastify's resolved `request.ip`, then `request.socket.remoteAddress`, and finally `"unknown"`. It does **not** trust raw `X-Forwarded-For` headers, so spoofed client-supplied XFF values do not create separate limiter buckets.

Leave `TRUST_PROXY=false` unless the app is behind a known, trusted proxy chain. If proxy trust is required, configure Fastify's `TRUST_PROXY` value for that exact ingress topology so `request.ip` is resolved by the framework rather than by raw headers.

For multi-instance production, prefer an edge/API-gateway or Redis-backed limiter so counts are shared across replicas.

## OpenAPI

OpenAPI is disabled by default. Enable it only for trusted environments or behind access control:

```env
OPENAPI_ENABLED=true
OPENAPI_PATH=docs
OPENAPI_TITLE=Nest React Boilerplate API
OPENAPI_VERSION=1.0.0
```

## Environment checklist

Before deploying, provide values for:

- `NODE_ENV=production`
- API `PORT` or per-process port mapping
- `CORS_ORIGINS`
- `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` if the production defaults need tuning
- `TRUST_PROXY=false` unless explicitly set for a known proxy configuration
- `AUTH_JWT_SECRET`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`
- OAuth issuer/client values if OAuth is enabled
- Explicit `VITE_AUTH_API_BASE_URL`, `VITE_USER_API_BASE_URL`, and `VITE_ADMIN_API_BASE_URL` origins if the frontend does not use same-origin proxying
- `DATABASE_URL` or `POSTGRES_*`
- `POSTGRES_SSL=true` for managed databases where required
- `POSTGRES_SYNCHRONIZE=false`

## Deployment notes

1. Build immutable images from a clean lockfile.
2. Inject secrets via a secret manager, not committed files.
3. Run migrations through a controlled release step before serving traffic.
4. Keep `/health` public for orchestration checks; protect business endpoints with bearer auth and RBAC metadata.
5. Capture JSON logs centrally and index by `requestId`.
6. Keep OpenAPI disabled publicly unless protected by SSO/VPN/edge auth.
7. Treat raw `X-Forwarded-For` as untrusted input; let the framework resolve `request.ip` only after `TRUST_PROXY` is explicitly configured.
8. Run CI gates: format, lint, typecheck, unit/component/e2e tests, coverage, and dependency audit.
