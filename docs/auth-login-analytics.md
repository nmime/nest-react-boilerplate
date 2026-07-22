# Authentication login analytics

## Ownership

Authentication capture belongs to `@app/backend-feature-auth-main`, durable
persistence belongs to `@app/backend-postgres-main-auth`, and privileged query
orchestration belongs to `@app/backend-feature-auth-admin`. The admin API and
SPA remain composition and presentation shells; no additional deployable is
introduced.

## Captured events

Every session-establishing password, Telegram, Discord, and Better Auth login or
registration records a tenant-scoped event with outcome, provider, channel,
known user, HMAC-only attempted identifier, request ID, trusted Fastify client
IP, user agent, language, timezone, and coarse GeoIP. Refresh and logout are not
counted as logins. Each event and its `auth.<type>.<outcome>` outbox record commit
in one transaction.

The capture path awaits persistence but does not convert valid credentials into
a login failure when analytics storage is unavailable. It logs the persistence
failure and preserves the authentication result, avoiding a half-established
cookie session followed by an error response.

## GeoIP, language, and timezone

`AUTH_GEOIP_DATABASE_PATH` points to an operator-mounted MaxMind-compatible City
MMDB. Lookups are local; authentication IPs are never sent to a geolocation web
service. Missing or invalid databases leave geo dimensions unknown. Private and
loopback addresses are not geolocated.

The browser sends `X-Client-Timezone` from the IANA timezone reported by
`Intl.DateTimeFormat`. A validated client timezone wins over the GeoIP fallback.
The authenticated user/provider locale wins over the normalized first
`Accept-Language` value. Both dimensions retain a source field.

IP geolocation is approximate and must not be presented as a household or exact
address. Operators must keep licensed GeoIP data current and mount it into every
auth API instance at the configured path.

## Privacy and retention

Exact IP and user agent are removed after
`AUTH_LOGIN_NETWORK_RETENTION_DAYS` (30 by default). The HMAC correlation value
and coarse aggregate dimensions remain until the whole event is deleted after
`AUTH_LOGIN_EVENT_RETENTION_DAYS` (365 by default). Cleanup runs at most hourly,
opportunistically after new events, so no extra scheduler application is
required. A dedicated `AUTH_LOGIN_ANALYTICS_IP_HASH_SECRET` is preferred; the
session secret is the fallback.

## Admin contract

The `admin:auth-login-analytics:read` permission protects:

- `GET /admin/auth/login-analytics` for paginated events and filters;
- `GET /admin/auth/login-analytics/summary` for success, failure, unique-user,
  provider, country, language, and timezone aggregates.

Queries are always confined to the authenticated administrator's tenant. The
admin page exposes the same filters, aggregate cards, top dimensions, event
table, and retained request evidence. Every query is itself covered by the
global admin access audit interceptor.

## Admin audit guarantee

All authenticated admin HTTP actions first write a fail-closed `admin.access`
audit event containing method, route template, controller, handler, request ID,
direct client IP, and user agent. Mutations additionally write domain-specific
before/after evidence and an outbox row in the same transaction as the state
change. The interceptor is the systemic safety net for reads and future routes;
transactional domain audits remain the source of mutation detail.
