# Environment Configuration Guide

This guide explains the supported configuration contracts and where to find
their complete templates. It is intentionally not a duplicated catalogue of
every test, CI, generator, or deployment variable.

## Sources of truth

Use the template that matches the runtime you are configuring:

| File                                          | Purpose                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `.env.example`                                | Canonical local application and infrastructure settings.               |
| `.env.local.example`                          | Local override template; active keys stay aligned with `.env.example`. |
| `.env.test.example`                           | Deterministic test settings.                                           |
| `.env.staging.example`                        | Staging-oriented example values.                                       |
| `.env.production.example`                     | Production Compose, domains, secret-file paths, and safe placeholders. |
| `deploy/single-server/server.env.example`     | Host bootstrap, Nginx, Certbot, and certificate-mode settings.         |
| `deploy/single-server/production.env.example` | Single-host engine/ownership and provider secret-file overlay.         |

The example files are the exhaustive operator-facing inventory. Runtime Joi
schemas and the production deployment validators enforce the values consumed by
code. When adding a setting, update its owning schema, relevant templates,
Compose/Helm wiring, tests, and documentation together.

Never commit a populated `.env` file or real secret material.

## Settings this boilerplate does not know about

A product built on this repository has its own backend settings, and the maps
that carry configuration into the containers are closed: `x-backend-env` in both
Compose files and the `data:` block of the Helm ConfigMap are edited on most
boilerplate releases, so adding a key there guarantees a merge conflict. Each
runtime has a seam that stays empty upstream instead:

| Runtime                | Seam                                   |
| ---------------------- | -------------------------------------- |
| Compose (dev and prod) | `docker/backend.product.env`           |
| Kubernetes             | `config.extra` in `.helm/values.yaml`  |
| Single-host, native    | the deployment's own `.env.production` |
| Single-host, compose   | inherits `docker/backend.product.env`  |

Both seams are additive only: Compose merges the env file underneath each
service's `environment`, and the chart lists the product ConfigMap _before_ its
own in `envFrom`, so on a duplicate key the boilerplate's value wins. That is
deliberate — every boilerplate key is already overridable, through the
deployment's `.env` under Compose and through the `config` block under Helm, and
overriding it there keeps one answer per key. Values are literal in both: Compose
does not interpolate `${...}` inside an env file.

Secrets do not belong in either seam; a ConfigMap is not encrypted at rest.
Add them to the `declared_secrets` manifest in `docker/secret-entrypoint.sh`, as
described under [Auth and sessions](#auth-and-sessions).

## Setup-generated selection

`pnpm nrb setup` records selected apps and capabilities in `.nrb`. It also
generates `.nrb/capabilities.env` for Compose/bootstrap activation. Rerunning
setup is the supported way to add another app or capability; it preserves prior
selections and does not invent a default application.

```bash
pnpm nrb setup
pnpm nrb setup --app user-app --app auth-app-api
pnpm nrb doctor
```

Application configuration still comes from the environment templates. Selection
metadata determines what is started; it does not contain production secrets.

## Core runtime

| Variable          | When required          | Purpose                                                                                 |
| ----------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`        | Always                 | Selects development, test, or production behavior.                                      |
| `HOST` / `PORT`   | Optional               | HTTP bind address and service port.                                                     |
| `DATABASE_ENGINE` | Durable persistence    | Exactly `postgres` or `mongodb`; must match durable `AUTH_PERSISTENCE`.                 |
| `DATABASE_URL`    | PostgreSQL-backed APIs | PostgreSQL connection URL.                                                              |
| `MONGODB_URI`     | MongoDB-backed APIs    | Native-driver URI for a transaction-capable topology; never log its credentials.        |
| `CORS_ORIGINS`    | Production APIs        | Comma-separated browser origins. Wildcards are not accepted by the production contract. |
| `TRUST_PROXY`     | Behind a trusted proxy | Enables forwarded client/protocol handling.                                             |
| `LOG_LEVEL`       | Optional               | Runtime log threshold.                                                                  |
| `OPENAPI_ENABLED` | Optional               | Enables the API's OpenAPI route/export behavior; production defaults to disabled.       |
| `OPENAPI_PATH`    | Optional               | Service-local OpenAPI path.                                                             |

Local Compose provides the selected provider's connection settings. Production
Compose derives/loads `DATABASE_URL` for PostgreSQL or `MONGODB_URI` for MongoDB
from the selected bundled/external database overlay.

## Auth and sessions

| Variable                                       | When required                             | Purpose                                                                                                           |
| ---------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`                               | Production first-party sessions           | Server-session cookie signing key.                                                                                |
| `BETTER_AUTH_SECRET`                           | Better Auth                               | Better Auth cookie/state secret.                                                                                  |
| `BETTER_AUTH_URL`                              | Better Auth                               | Public Better Auth origin.                                                                                        |
| `BETTER_AUTH_TRUSTED_ORIGINS`                  | Browser auth                              | Comma-separated origins accepted by Better Auth.                                                                  |
| `AUTH_ALLOWED_RETURN_URLS`                     | External browser auth                     | Comma-separated absolute frontend origins accepted as post-auth returns.                                          |
| `AUTH_PERSISTENCE`                             | Optional                                  | `postgres` or `mongodb` for durable persistence; `memory` is test/development only.                               |
| `AUTH_GEOIP_DATABASE_PATH`                     | Optional                                  | Absolute path to an operator-mounted GeoIP2/GeoLite2 City MMDB. Empty disables enrichment without blocking login. |
| `AUTH_LOGIN_NETWORK_RETENTION_DAYS`            | Optional                                  | Days to retain exact IP address and user agent; defaults to 30.                                                   |
| `AUTH_LOGIN_EVENT_RETENTION_DAYS`              | Optional                                  | Days to retain the append-only login event and coarse dimensions; defaults to 365.                                |
| `AUTH_LOGIN_ANALYTICS_IP_HASH_SECRET`          | Optional secret                           | Dedicated HMAC key for IP/identifier correlation. Falls back to `SESSION_SECRET`.                                 |
| `AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED`       | Social provider token storage             | Must be `true` outside local/test when provider access or refresh tokens are persisted.                           |
| `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY` / `_FILE` | When provider-token encryption is enabled | 32-byte base64 key supplied inline or through the deployment secret-file path.                                    |
| `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_ID`        | Optional                                  | Key identifier stored with encrypted provider-token records to support rotation.                                  |

### Demo mode (no login at all)

An MVP or investor demo usually needs the product reachable without accounts,
credentials, or a seeded database. `AUTH_DEMO_MODE` turns that on at the single
place every access guard resolves a principal, so every API request that carries
no session runs as one synthetic user:

| Variable                     | When required                             | Purpose                                                                                                   |
| ---------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AUTH_DEMO_MODE`             | Optional                                  | `true` serves every unauthenticated request as the demo principal. Defaults to `false`.                   |
| `AUTH_DEMO_ALLOW_PRODUCTION` | With the above when `NODE_ENV=production` | Second acknowledgement; without it a production process refuses to start serving demo traffic.            |
| `AUTH_DEMO_ROLES`            | Optional                                  | Comma-separated roles for the demo principal; defaults to `user`. Use `user,admin` to open the admin app. |
| `AUTH_DEMO_SUBJECT`          | Optional                                  | Subject id of the demo principal; defaults to an obviously synthetic UUID.                                |
| `AUTH_DEMO_TENANT_ID`        | Optional                                  | Tenant UUID for the demo principal; defaults to the default tenant.                                       |
| `AUTH_DEMO_EMAIL`            | Optional                                  | Display email; defaults to `demo@example.invalid`.                                                        |
| `AUTH_DEMO_DISPLAY_NAME`     | Optional                                  | Display name; defaults to `Demo User`.                                                                    |

What demo mode does and does not do:

- Permissions still come from the shared RBAC role matrix, so the demo principal
  can never hold a grant a real account with those roles would not have. An
  unknown role in `AUTH_DEMO_ROLES` is a startup-time error rather than a
  silently powerless demo.
- No account row is required. The database-backed guards skip their per-request
  account and role lookups for the demo principal only, recognised by object
  identity — a session, token, or request body that merely looks like the demo
  user still takes the normal database path and is rejected.
- A real session always wins. Logging in over a demo deployment works and
  replaces the demo principal for that session; logging out returns to it.
- It is refused outside a demo. `NODE_ENV=production` needs
  `AUTH_DEMO_ALLOW_PRODUCTION=true` as well, and any incoherent value (a bad
  UUID, a `AUTH_DEMO_MODE` that is neither `true` nor `false`) fails loudly
  instead of half-enabling the bypass.

Production Compose mounts `SESSION_SECRET_FILE` and `BETTER_AUTH_SECRET_FILE`;
`docker/secret-entrypoint.sh` loads them into the
canonical runtime variables before Node starts. The single-server bootstrap
generates these secrets on first initialization and preserves them on reruns.

That entrypoint's `declared_secrets` manifest is the workspace's one enumeration
of application secrets, and the rest of the deployment surface derives from it:
`scripts/native-runtime-env.mjs` builds the `_FILE` indirections a PM2 process
tree resolves, and a spec asserts that `deploy/single-server/serverctl`
provisions a file for every entry. Adding a secret therefore means adding one
manifest line — with two exceptions the manifest cannot express, listed in
`applicationResolvedSecretFiles`: `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE` and
`NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE` stay paths, because the application
dereferences those two itself and refuses to start when both forms are set.
Provision the file even for a secret the deployment leaves empty: Compose mounts
a declared secret as a bind, so a missing source file stops the container from
being created at all.

## Telegram and Discord

Telegram auth and bot execution are separate switches:

| Variable                                                                          | Purpose                                                                                 |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `AUTH_TELEGRAM_ENABLED`                                                           | Enables Telegram identity projection in auth.                                           |
| `TELEGRAM_OIDC_ENABLED`                                                           | Enables the Telegram OIDC provider flow.                                                |
| `TELEGRAM_OIDC_CLIENT_ID` / `TELEGRAM_OIDC_CLIENT_SECRET`                         | Telegram OIDC credentials.                                                              |
| `TELEGRAM_OIDC_DISCOVERY_URL` / `TELEGRAM_OIDC_ISSUER` / `TELEGRAM_OIDC_JWKS_URL` | Advanced endpoint/issuer overrides; leave empty to use the provider discovery defaults. |
| `TELEGRAM_BOT_TOKEN`                                                              | Validates signed TMA data and runs the bot.                                             |
| `TELEGRAM_BOT_MODE`                                                               | `webhook` or `polling`.                                                                 |
| `TELEGRAM_BOT_WEBHOOK_URL` / `TELEGRAM_BOT_WEBHOOK_SECRET`                        | Public webhook registration and verification.                                           |
| `TELEGRAM_MINI_APP_URL`                                                           | URL opened by bot menu/app buttons.                                                     |
| `TELEGRAM_TMA_MAX_AGE_SECONDS`                                                    | Maximum accepted TMA authorization age.                                                 |

Discord uses `DISCORD_AUTH_ENABLED`, `DISCORD_APPLICATION_ID`,
`DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, and
`DISCORD_REDIRECT_URI`. OAuth state validation additionally reads
`DISCORD_OAUTH_STATE_TTL_SECONDS` (state entry lifetime, default `600`) and
`DISCORD_OAUTH_STATE_MAX_ENTRIES` (state cache cap, default `10000`).
Enable the `telegram` or `discord` Compose profile only
when its app was selected and provider-issued credentials are populated.

The server bootstrap creates protected empty files for provider-issued secrets;
it cannot fabricate valid Telegram or Discord credentials.

## Durable database provider

PostgreSQL and MongoDB are mutually exclusive. Existing presets and examples
select PostgreSQL until intentionally changed. Setup writes both
`DATABASE_ENGINE` and `AUTH_PERSISTENCE`; production Compose and Helm validate
the same pairing.

### PostgreSQL

| Variable                                  | Purpose                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POSTGRES_POOL_MIN` / `POSTGRES_POOL_MAX` | MikroORM connection-pool bounds. `POSTGRES_POOL_MIN` may be zero; `POSTGRES_POOL_MAX` must be at least one. |
| `POSTGRES_POOL_IDLE_TIMEOUT_MS`           | Idle PostgreSQL connection lifetime in milliseconds.                                                        |

`DATABASE_URL` takes precedence for runtime connection configuration. Local
Compose also uses `CONTAINER_DATABASE_URL`; external production ownership uses
`DATABASE_URL_FILE`. Keep `POSTGRES_SYNCHRONIZE=false` and apply MikroORM
migrations explicitly.

### MongoDB

| Variable                                          | Purpose                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `MONGODB_URI` / `MONGODB_URI_FILE`                | Runtime URI or production external-database secret file.                                    |
| `MONGODB_DATABASE`                                | Explicit database name; must match a non-empty URI database path when one is present.       |
| `MONGODB_REPLICA_SET`                             | Expected replica-set name; must match the URI and deployed topology.                        |
| `MONGODB_APP_NAME`                                | Optional native-driver application name.                                                    |
| `MONGODB_CONNECT_TIMEOUT_MS`                      | Positive connection timeout; runtime default `10000`.                                       |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS`             | Positive server-selection timeout; runtime default `5000`, deployment examples use `10000`. |
| `MONGODB_MIN_POOL_SIZE` / `MONGODB_MAX_POOL_SIZE` | Pool bounds; minimum may be zero and must not exceed the positive maximum.                  |
| `MONGODB_PORT`                                    | Published local-development port; default `27017`.                                          |
| `MONGODB_USER` / `MONGODB_ROOT_USER`              | Bundled production application/root identities; passwords remain secret-file-only.          |
| `MONGODB_MIGRATION_USER`                          | Bundled migration identity with application-database DDL privileges.                        |
| `MONGODB_BACKUP_RESTORE_USER`                     | Bundled deployment-wide backup/restore identity authenticated against `admin`.              |
| `MONGODB_PASSWORD_FILE`                           | Bundled application-user password file.                                                     |
| `MONGODB_MIGRATION_PASSWORD_FILE`                 | Bundled migration-user password file.                                                       |
| `MONGODB_BACKUP_RESTORE_PASSWORD_FILE`            | Bundled backup/restore-user password file.                                                  |
| `MONGODB_MIGRATION_URI_FILE`                      | External migration-principal URI secret file.                                               |
| `MONGODB_BACKUP_RESTORE_URI` / `_FILE`            | Deployment-wide backup/restore URI with no database path and `authSource=admin`.            |
| `MONGODB_ROOT_PASSWORD_FILE`                      | Bundled root-user password file.                                                            |
| `MONGODB_KEYFILE_FILE`                            | Bundled replica-set internal-auth keyfile.                                                  |
| `MONGODB_DATABASE_TOOLS_USE_DOCKER`               | Forces the pinned Docker fallback for `mongodump`/`mongorestore`.                           |
| `MONGODB_DATABASE_TOOLS_DOCKER_NETWORK`           | Optional Docker network for tools; bundled production uses the internal Compose network.    |

URIs must use `mongodb://` or `mongodb+srv://`; `directConnection=true`,
`loadBalanced=true`, and `retryWrites=false` are rejected. The first-class
setup, database-operation, Compose, and Helm paths require an explicit
unsharded replica set. Local/bundled one-node mode provides transactions but not
HA; production should use a managed or operator-owned multi-node replica set.
Standalone MongoDB is rejected.

### Redis, NATS, and static data

| Variable                    | Purpose                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `REDIS_URL` / `REDIS_HOSTS` | Single-node URL and/or the comma-separated endpoints used by cluster/sentinel modes.                      |
| `REDIS_LAZY_CONNECT`        | Defers the initial Redis connection until first use; defaults to `true`.                                  |
| `NATS_SERVERS`              | Comma-separated NATS server URLs. Empty disables the optional NATS integration.                           |
| `NATS_TOKEN`                | Optional token authentication; mutually exclusive with `NATS_USER`/`NATS_PASS`.                           |
| `STATIC_DATA_ROOT`          | Root directory used by the backend static-data provider; defaults to `data` in the environment templates. |

See [NATS foundation](nats.md) and the environment templates for the remaining
timeouts, reconnect settings, Redis topology options, and service-specific
ports.

## Object storage (S3 / MinIO)

Selecting the `s3` capability wires `S3Module.forRoot()` into selected backend
apps. The default adapter is the AWS SDK v3 client and works with AWS S3 or an
S3-compatible endpoint such as MinIO.

| Variable                          | Required for use                          | Default                                       |
| --------------------------------- | ----------------------------------------- | --------------------------------------------- |
| `S3_BUCKET`                       | Unless every operation supplies a bucket  | Local example: `nest-react-boilerplate`       |
| `S3_REGION`                       | Yes                                       | `us-east-1`                                   |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Together when static credentials are used | Local MinIO values in local templates         |
| `S3_ENDPOINT`                     | For MinIO/custom endpoints                | AWS SDK endpoint resolution when empty        |
| `S3_FORCE_PATH_STYLE`             | Usually for MinIO                         | `true` locally, `false` in production example |

Start local MinIO with the `s3` profile. The configured bucket must exist before
product code writes objects. Production credentials are provider-issued and are
therefore not generated by the server bootstrap.

## Analytics

Analytics is disabled unless explicitly selected and configured. The PostHog
provider uses `ANALYTICS_POSTHOG_API_KEY` and
`ANALYTICS_POSTHOG_HOST`; `ANALYTICS_PROVIDER` or
`ANALYTICS_PROVIDERS` selects the active provider set. Do not use the obsolete
unprefixed PostHog key.

## Notifications

Canonical authentication publishes verification/reset codes through the
notification queue; it does not call mail or bot SDKs directly.
`AUTH_NOTIFICATION_PROVIDER` selects `telegram-bot`, `discord-bot`, `resend`, or
`mailpace`. When omitted, `NOTIFICATION_EMAIL_PROVIDER` selects the default
email provider (`resend` or `mailpace`).

| Variable                                                                               | Purpose                                                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `NOTIFICATION_PAYLOAD_ENCRYPTION_KEY` / `_FILE`                                        | Required 32-byte base64 or 64-character hex key shared by producers, consumer, and scheduler. Use the file form in production. |
| `NOTIFICATION_EMAIL_FROM`                                                              | Verified sender used by Resend and MailPace.                                                                                   |
| `RESEND_API_KEY` / `_FILE`                                                             | Resend credential; scheduler-only.                                                                                             |
| `MAILPACE_SERVER_TOKEN` / `_FILE`                                                      | MailPace credential; scheduler-only.                                                                                           |
| `NOTIFICATION_DELIVERIES_PER_ITERATION`                                                | Maximum delivery rows claimed by one scheduler iteration.                                                                      |
| `NOTIFICATION_REQUESTS_PER_SECOND`                                                     | Provider request throttle.                                                                                                     |
| `NOTIFICATION_BROADCAST_REQUIRE_INDEPENDENT_APPROVAL`                                  | Requires a different admin to approve a broadcast; production defaults to `true`.                                              |
| `NOTIFICATION_CONSUMER_INTERVAL_MS`                                                    | Background consumer polling interval.                                                                                          |
| `NOTIFICATION_MATERIALIZATION_CHUNK_SIZE`                                              | Maximum recipients materialized per consumer iteration.                                                                        |
| `NOTIFICATION_CSV_MAX_BYTES` / `NOTIFICATION_CSV_MAX_ROWS`                             | Static-segment upload bounds.                                                                                                  |
| `NOTIFICATION_FCM_PROJECT_ID`, `NOTIFICATION_FCM_CLIENT_EMAIL`                         | Firebase service-account identity for HTTP v1 push delivery.                                                                   |
| `NOTIFICATION_FCM_PRIVATE_KEY` / `_FILE`                                               | Firebase service-account private key; scheduler-only.                                                                          |
| `NOTIFICATION_FCM_TOKEN_URI`                                                           | OAuth token endpoint; defaults to Google's endpoint.                                                                           |
| `NOTIFICATION_APNS_TEAM_ID`, `NOTIFICATION_APNS_KEY_ID`, `NOTIFICATION_APNS_BUNDLE_ID` | APNs token-auth identity and topic.                                                                                            |
| `NOTIFICATION_APNS_PRIVATE_KEY` / `_FILE`                                              | APNs `.p8` private key; scheduler-only.                                                                                        |
| `NOTIFICATION_APNS_SANDBOX`                                                            | Uses Apple's development endpoint when `true`.                                                                                 |

Select both `notification-consumer` and `notification-scheduler` runtime
profiles. The consumer needs the selected durable provider and configured S3 storage but receives
no provider secret; the scheduler receives only the credentials for enabled
providers. See [Notifications](notifications.md).

## OpenTelemetry and Prometheus

| Variable                              | Purpose                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `OTEL_ENABLED`                        | Enables the application OpenTelemetry SDK.                              |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         | Base collector URL for traces and metrics.                              |
| `OTEL_EXPORTER_OTLP_HEADERS`          | Optional shared OTLP headers supplied by the deployment secret manager. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  | Optional trace-specific endpoint.                                       |
| `OTEL_EXPORTER_OTLP_TRACES_HEADERS`   | Optional trace-specific headers that override shared keys.              |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Optional metric-specific endpoint.                                      |
| `OTEL_EXPORTER_OTLP_METRICS_HEADERS`  | Optional metric-specific headers that override shared keys.             |
| `OTEL_METRIC_EXPORT_INTERVAL`         | Metric export interval in milliseconds.                                 |

Applications export OTLP. They do not expose per-service `/metrics` endpoints.
The collector exposes Prometheus format on port `9464`; see
[Monitoring and Alerting](monitoring.md).

## Frontend API routing

Production frontends use `VITE_API_BASE_URL_MODE`:

- `same-origin` uses the edge proxy routes and is the production default.
- `explicit` requires the relevant `VITE_AUTH_API_BASE_URL`,
  `VITE_USER_API_BASE_URL`, and `VITE_ADMIN_API_BASE_URL` values.

The production build rejects missing explicit origins rather than silently
falling back to example domains.

## Production domains and Compose topology

| Variable                     | Supported values                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_DOMAIN`              | Base domain such as `example.com`; no scheme, path, port, or wildcard.                                                                 |
| `PRIMARY_APP`                | Any publicly served app ID; owns the apex domain. Host Nginx single-domain mode additionally requires a frontend app.                  |
| `DATABASE_ENGINE`            | `postgres` or `mongodb`; independent from ownership but must match auth persistence and provider secrets.                              |
| `COMPOSE_DATABASE_MODE`      | `bundled-db` or `external-db`.                                                                                                         |
| `COMPOSE_DOMAIN_MODE`        | `single-domain`, `per-app-domains`, or `external-proxy`.                                                                               |
| `EXTERNAL_PROXY_PUBLIC_MODE` | `single-domain` or `per-app-domains` for host Nginx.                                                                                   |
| `COMPOSE_TLS_MODE`           | `automatic`, `provided`, or `external`, constrained by the domain mode.                                                                |
| `COMPOSE_PROFILES`           | Explicit comma-separated service/profile IDs for the local Compose topology; production accepts only its documented provider profiles. |

Per-app mode derives the exact app-ID hostnames in the
[Project Catalog](project-catalog.md); the chosen `PRIMARY_APP` receives the
apex. Single-domain mode publishes the selected surfaces through the apex edge
routes. See
[Docker Compose Production](docker-compose-production.md) and
[Single-server Deployment](single-server-deployment.md).

The four supported single-host pairs are PostgreSQL/MongoDB crossed with
`bundled-db`/`external-db`. Bundled MongoDB requires separate runtime,
migration, and backup/restore credentials plus root authentication and a
keyfile. External MongoDB requires separate runtime, migration, and
backup/restore URI files with one matching non-empty `replicaSet` option.
Kubernetes uses `database.engine` plus `database.ownership=external-db`; the
application chart never provisions either database.

## Safe initialization

```bash
cp .env.local.example .env.local
pnpm nrb setup
pnpm nrb doctor
```

For production Compose, copy `.env.production.example` to an untracked file and
replace every selected provider placeholder through your secret manager. For a
single server, use `deploy/single-server/bootstrap.sh`; its rerunnable
controller generates locally generatable secrets, installs/pins Node and pnpm,
configures Nginx/Certbot, validates the rendered topology, and leaves
provider-issued credentials for the operator.
