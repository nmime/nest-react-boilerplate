# Environment Configuration Guide

This guide explains the supported configuration contracts and where to find
their complete templates. It is intentionally not a duplicated catalogue of
every test, CI, generator, or deployment variable.

## Sources of truth

Use the template that matches the runtime you are configuring:

| File                                      | Purpose                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `.env.example`                            | Canonical local application and infrastructure settings.               |
| `.env.local.example`                      | Local override template; active keys stay aligned with `.env.example`. |
| `.env.test.example`                       | Deterministic test settings.                                           |
| `.env.staging.example`                    | Staging-oriented example values.                                       |
| `.env.production.example`                 | Production Compose, domains, secret-file paths, and safe placeholders. |
| `deploy/single-server/server.env.example` | Host bootstrap, Nginx, Certbot, and certificate-mode settings.         |

The example files are the exhaustive operator-facing inventory. Runtime Joi
schemas and the production deployment validators enforce the values consumed by
code. When adding a setting, update its owning schema, relevant templates,
Compose/Helm wiring, tests, and documentation together.

Never commit a populated `.env` file or real secret material.

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
| `DATABASE_URL`    | PostgreSQL-backed APIs | PostgreSQL connection URL.                                                              |
| `CORS_ORIGINS`    | Production APIs        | Comma-separated browser origins. Wildcards are not accepted by the production contract. |
| `TRUST_PROXY`     | Behind a trusted proxy | Enables forwarded client/protocol handling.                                             |
| `LOG_LEVEL`       | Optional               | Runtime log threshold.                                                                  |
| `OPENAPI_ENABLED` | Optional               | Enables the API's OpenAPI route/export behavior; production defaults to disabled.       |
| `OPENAPI_PATH`    | Optional               | Service-local OpenAPI path.                                                             |

Local Compose provides `CONTAINER_DATABASE_URL`; production Compose derives or
loads `DATABASE_URL` from the selected bundled/external database overlay.

## Auth and sessions

| Variable                      | When required                    | Purpose                                                                    |
| ----------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `AUTH_JWT_SECRET`             | Production auth/API verification | JWT signing key.                                                           |
| `SESSION_SECRET`              | Production browser sessions      | Session signing key.                                                       |
| `BETTER_AUTH_SECRET`          | Better Auth                      | Better Auth cookie/state secret.                                           |
| `BETTER_AUTH_URL`             | Better Auth                      | Public Better Auth origin.                                                 |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Browser auth                     | Comma-separated origins accepted by Better Auth.                           |
| `AUTH_JWT_ISSUER`             | Optional                         | JWT issuer. Defaults to the auth API domain contract.                      |
| `AUTH_JWT_AUDIENCE`           | Optional                         | JWT audience used by protected APIs.                                       |
| `AUTH_PERSISTENCE`            | Optional                         | `postgres` for the real persistence path; memory is test/development only. |

Production Compose mounts `AUTH_JWT_SECRET_FILE`, `SESSION_SECRET_FILE`, and
`BETTER_AUTH_SECRET_FILE`; `docker/secret-entrypoint.sh` loads them into the
canonical runtime variables before Node starts. The single-server bootstrap
generates these secrets on first initialization and preserves them on reruns.

## Telegram and Discord

Telegram auth and bot execution are separate switches:

| Variable                                                   | Purpose                                       |
| ---------------------------------------------------------- | --------------------------------------------- |
| `AUTH_TELEGRAM_ENABLED`                                    | Enables Telegram identity projection in auth. |
| `TELEGRAM_OIDC_ENABLED`                                    | Enables the Telegram OIDC provider flow.      |
| `TELEGRAM_OIDC_CLIENT_ID` / `TELEGRAM_OIDC_CLIENT_SECRET`  | Telegram OIDC credentials.                    |
| `TELEGRAM_BOT_TOKEN`                                       | Validates signed TMA data and runs the bot.   |
| `TELEGRAM_BOT_MODE`                                        | `webhook` or `polling`.                       |
| `TELEGRAM_BOT_WEBHOOK_URL` / `TELEGRAM_BOT_WEBHOOK_SECRET` | Public webhook registration and verification. |
| `TELEGRAM_MINI_APP_URL`                                    | URL opened by bot menu/app buttons.           |
| `TELEGRAM_TMA_MAX_AGE_SECONDS`                             | Maximum accepted TMA authorization age.       |

Discord uses `DISCORD_AUTH_ENABLED`, `DISCORD_APPLICATION_ID`,
`DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, and
`DISCORD_REDIRECT_URI`. Enable the `telegram` or `discord` Compose profile only
when its app was selected and provider-issued credentials are populated.

The server bootstrap creates protected empty files for provider-issued secrets;
it cannot fabricate valid Telegram or Discord credentials.

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

The repository does not bundle SendGrid or another email-delivery SDK. Better
Auth lifecycle hooks are the extension point; add the provider, schema,
templates, deployment secrets, and tests as one product-owned integration.

## OpenTelemetry and Prometheus

| Variable                              | Purpose                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `OTEL_ENABLED`                        | Enables the application OpenTelemetry SDK.                              |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         | Base collector URL for traces and metrics.                              |
| `OTEL_EXPORTER_OTLP_HEADERS`          | Optional inline OTLP headers supplied by the deployment secret manager. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  | Optional trace-specific endpoint.                                       |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Optional metric-specific endpoint.                                      |
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

| Variable                     | Supported values                                                        |
| ---------------------------- | ----------------------------------------------------------------------- |
| `PUBLIC_DOMAIN`              | Base domain such as `example.com`; no scheme, path, port, or wildcard.  |
| `PRIMARY_APP`                | `landing-app` or `site-app`; owns the apex domain.                      |
| `COMPOSE_DATABASE_MODE`      | `bundled-db` or `external-db`.                                          |
| `COMPOSE_DOMAIN_MODE`        | `single-domain`, `per-app-domains`, or `external-proxy`.                |
| `EXTERNAL_PROXY_PUBLIC_MODE` | `single-domain` or `per-app-domains` for host Nginx.                    |
| `COMPOSE_TLS_MODE`           | `automatic`, `provided`, or `external`, constrained by the domain mode. |
| `COMPOSE_PROFILES`           | Optional comma-separated `telegram` and/or `discord`.                   |

Per-app mode derives the exact app-ID hostnames in the
[Project Catalog](project-catalog.md); the chosen `PRIMARY_APP` receives the
apex. Single-domain mode publishes the selected surfaces through the apex edge
routes. See
[Docker Compose Production](docker-compose-production.md) and
[Single-server Deployment](single-server-deployment.md).

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
