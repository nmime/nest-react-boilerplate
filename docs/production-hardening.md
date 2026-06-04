# Production hardening guide

This boilerplate ships with conservative production defaults for the Nest APIs and an explicit environment contract.

## Security defaults

- `helmet()` is enabled for every API at bootstrap.
- Request validation uses transform, whitelist, and forbid-non-whitelisted settings.
- Production CORS does **not** reflect arbitrary origins. Set `CORS_ORIGINS` to a comma-separated allow-list.
- Frontend nginx CSP permits API connections only to same-origin proxy routes or to the documented split-origin API hosts: `https://auth.example.com`, `https://api.example.com`, and `https://admin-api.example.com`.
- Production rate limiting is enabled by default unless `RATE_LIMIT_ENABLED=false` or an explicit `rateLimit.enabled: false` option disables it.
- Backend env used by bootstrap is parsed through a centralized fail-fast schema before the app listens.
- `TRUST_PROXY` defaults to `false`; only set it to a known proxy configuration for trusted load balancers or ingress tiers.
- Shutdown hooks are enabled for graceful termination.
- Every request receives or preserves an `x-request-id` header.
- Completion logs are structured JSON and include only `appName`, `requestId`, `method`, `path`, `status`, and `durationMs`.

## Auth and RBAC

The auth feature exports reusable access-control primitives:

- `BearerAuthGuard` verifies HMAC JWT bearer tokens with `AUTH_JWT_SECRET`.
- `AUTH_PERSISTENCE=memory` is rejected in production; use the default `postgres` persistence with `DATABASE_URL`.
- `AUTH_JWT_ISSUER` and `AUTH_JWT_AUDIENCE` are optional but should be set in production.
- `RbacGuard` enforces `@RequireRoles()` and `@RequirePermissions()` metadata.
- Role checks are any-of; permission checks require all listed permissions.
- `@Public()` can mark health or intentionally anonymous routes.
- `@CurrentUser()` reads the verified principal attached to `request.user` and `request.auth`.

JWTs must not use `alg:none`. Unsupported algorithms, bad signatures, expired tokens, future `nbf` tokens, and issuer/audience mismatches are rejected.

## Backend environment validation

`bootstrapNestApi()` calls `resolveBackendEnvironmentConfig()` before binding a listener. Invalid booleans, ports, session cookie settings, rate-limit windows, Redis settings, and production-only requirements throw immediately so broken deployments do not start partially configured.

Production startup requires:

- `DATABASE_URL` for durable server-side sessions.
- `SESSION_SECRET` or `AUTH_JWT_SECRET` with at least 32 characters.
- Valid positive integer `PORT`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, and `SESSION_COOKIE_MAX_AGE_SECONDS` values when set.
- Valid `RATE_LIMIT_STORE` (`auto`, `memory`, or `redis`) and Redis connection settings when `RATE_LIMIT_STORE=redis`.
- Redis/distributed rate limiting in production, unless `RATE_LIMIT_IN_MEMORY_ALLOWED=true` is set after equivalent ingress/API-gateway limits are configured.

## Rate limiting and proxy trust

The bootstrap layer includes a rate limiter that defaults to **on in production** and **off outside production** unless `RATE_LIMIT_ENABLED` or `options.rateLimit.enabled` is explicitly set:

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_STORE=auto
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

`RATE_LIMIT_STORE=auto` uses Redis when `REDIS_URL` or `REDIS_HOSTS` is configured. `RATE_LIMIT_STORE=redis` fails startup if Redis config is missing and pings Redis before the API begins listening. Production startup fails if the resolved store is in-memory unless `RATE_LIMIT_IN_MEMORY_ALLOWED=true` is set after equivalent ingress/API-gateway limits are configured, because in-memory limits are per process and not shared across replicas.

```env
RATE_LIMIT_STORE=redis
REDIS_URL=redis://redis:6379/0
REDIS_KEY_PREFIX=nrb:
```

The production Docker Compose stack includes a Redis service and defaults APIs to `RATE_LIMIT_STORE=redis`. For Kubernetes or managed deployments, provide `REDIS_URL` or `REDIS_HOSTS` through your Secret/ConfigMap layer, or enforce equivalent shared limits at the ingress/API gateway before setting `RATE_LIMIT_STORE=memory` and `RATE_LIMIT_IN_MEMORY_ALLOWED=true`.

The limiter key is derived from Fastify's resolved `request.ip`, then `request.socket.remoteAddress`, and finally `"unknown"`. It does **not** trust raw `X-Forwarded-For` headers, so spoofed client-supplied XFF values do not create separate limiter buckets.

Leave `TRUST_PROXY=false` unless the app is behind a known, trusted proxy chain. If proxy trust is required, configure Fastify's `TRUST_PROXY` value for that exact ingress topology so `request.ip` is resolved by the framework rather than by raw headers.

## OpenAPI

OpenAPI is disabled by default. Enable it only for trusted environments or behind access control:

```env
OPENAPI_ENABLED=true
OPENAPI_ALLOW_PRODUCTION=true
OPENAPI_PATH=docs
OPENAPI_TITLE=Nest React Boilerplate API
OPENAPI_VERSION=1.0.0
```

## Environment checklist

Before deploying, provide values for:

- `NODE_ENV=production`
- API `PORT` or per-process port mapping
- `CORS_ORIGINS`
- `RATE_LIMIT_STORE=redis` with `REDIS_URL`/`REDIS_HOSTS`, or documented ingress/API-gateway limits plus `RATE_LIMIT_IN_MEMORY_ALLOWED=true` if using `memory`
- `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` if the production defaults need tuning
- `TRUST_PROXY=false` unless explicitly set for a known proxy configuration
- `AUTH_JWT_SECRET`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`
- OAuth issuer/client values if OAuth is enabled
- Explicit `VITE_AUTH_API_BASE_URL`, `VITE_USER_API_BASE_URL`, and `VITE_ADMIN_API_BASE_URL` origins if the frontend does not use same-origin proxying
- `DATABASE_URL` or `POSTGRES_*`
- `POSTGRES_SSL=true` for managed databases where required
- `POSTGRES_SYNCHRONIZE=false`

## Database seed safety

`pnpm db:seed` defaults are local-development only. The command refuses non-local/dev databases unless `--force` is supplied with `DB_SEED_ALLOW_NON_LOCAL=true`; production additionally requires `DB_SEED_ALLOW_PRODUCTION=true`. Default `admin@example.com` / `ChangeMe123!` seed credentials are rejected for production or non-local targets. Pass a product admin email and a strong password, preferably through `--password-env ADMIN_SEED_PASSWORD`.

## Deployment notes

1. Build immutable images from a clean lockfile.
2. Inject secrets via a secret manager, not committed files.
3. Run migrations through a controlled release step before serving traffic.
4. Keep `/health` public for orchestration checks; protect business endpoints with bearer auth and RBAC metadata.
5. Capture JSON logs centrally and index by `requestId`.
6. Keep OpenAPI disabled publicly unless protected by SSO/VPN/edge auth.
7. Treat raw `X-Forwarded-For` as untrusted input; let the framework resolve `request.ip` only after `TRUST_PROXY` is explicitly configured.
8. Run CI gates: format, lint, typecheck, unit/component/e2e tests, coverage, and dependency audit.
