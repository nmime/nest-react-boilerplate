# Environment Variables Reference

Complete reference of all environment variables used across the monorepo. Source of truth: `.env.example`.

## Quick lookup

| Category          | Required vars                                                    |
| ----------------- | ---------------------------------------------------------------- |
| Core              | `DATABASE_URL`                                                   |
| Auth              | `SESSION_SECRET`, `AUTH_JWT_SECRET`                              |
| Telegram          | `TELEGRAM_BOT_TOKEN`                                             |
| Discord           | `DISCORD_BOT_TOKEN`                                              |
| External services | `SENDGRID_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| Observability     | none (all optional)                                              |

## Full variable catalogue

### Core runtime

| Variable                       | Required     | Default                  | Description                                                        |
| ------------------------------ | ------------ | ------------------------ | ------------------------------------------------------------------ |
| `NODE_ENV`                     | Optional     | `production`             | Runtime mode: `development`, `test`, `production`                  |
| `PORT`                         | Optional     | —                        | Global HTTP port (service-specific ports preferred)                |
| `CONTAINER`                    | Optional     | —                        | Container identifier for distributed tracing                       |
| `DATABASE_URL`                 | **Required** | —                        | PostgreSQL connection string (`postgres://user:pass@host:5432/db`) |
| `APP_NAME`                     | Optional     | `nest-react-boilerplate` | Application name used in logs and health                           |
| `CI`                           | Optional     | `false`                  | Set to `true` in CI environments                                   |
| `GRACEFUL_SHUTDOWN`            | Optional     | `true`                   | Enable graceful shutdown signal handling                           |
| `HOST`                         | Optional     | `0.0.0.0`                | Bind address for HTTP servers                                      |
| `KUBERNETES_SERVICE_HOST`      | Optional     | —                        | K8s service host (auto-set in cluster)                             |
| `LOG_LEVEL`                    | Optional     | `info`                   | Log level: `debug`, `info`, `warn`, `error`                        |
| `LOG_FORMAT` / `LOGGER_FORMAT` | Optional     | `json`                   | Log output format: `json` or `pretty`                              |
| `TRUST_PROXY`                  | Optional     | `false`                  | Trust reverse-proxy headers (`X-Forwarded-For`)                    |

### Service ports

| Variable                | Default | Description               |
| ----------------------- | ------- | ------------------------- |
| `ADMIN_APP_API_PORT`    | `3001`  | Admin API port            |
| `ADMIN_APP_PORT`        | `4200`  | Admin frontend dev port   |
| `USER_APP_API_PORT`     | `3002`  | User API port             |
| `USER_APP_PORT`         | `4201`  | User frontend dev port    |
| `AUTH_APP_API_PORT`     | `3003`  | Auth API port             |
| `DISCORD_APP_API_PORT`  | `3007`  | Discord API port          |
| `TELEGRAM_BOT_API_PORT` | `3013`  | Telegram webhook API port |
| `LANDING_APP_PORT`      | `4202`  | Landing page dev port     |
| `SITE_APP_PORT`         | `4203`  | Site (Vike SSR) dev port  |
| `MOBILE_APP_PORT`       | `4300`  | Mobile (Expo) dev port    |

### CORS and origins

| Variable                 | Required | Default     | Description                                         |
| ------------------------ | -------- | ----------- | --------------------------------------------------- |
| `CORS_ORIGINS`           | Optional | —           | Comma-separated list of allowed CORS origins        |
| `USER_APP_URL`           | Optional | —           | User app URL for redirects and link generation      |
| `FULLSTACK_BASE_URL`     | Optional | —           | Base URL for fullstack e2e tests                    |
| `FULLSTACK_HOST`         | Optional | `127.0.0.1` | Host for fullstack e2e tests                        |
| `VITE_API_BASE_URL_MODE` | Optional | —           | Frontend API mode: `same-origin`, `explicit`, `env` |

### Session and cookies

| Variable                         | Required            | Default          | Description                        |
| -------------------------------- | ------------------- | ---------------- | ---------------------------------- |
| `SESSION_SECRET`                 | **Required** (prod) | —                | Secret for signing session cookies |
| `SESSION_COOKIE_NAME`            | Optional            | `__Host-nrb.sid` | Session cookie name                |
| `SESSION_COOKIE_SECURE`          | Optional            | `true`           | HTTPS-only cookie flag             |
| `SESSION_COOKIE_SAME_SITE`       | Optional            | `lax`            | SameSite cookie attribute          |
| `SESSION_COOKIE_MAX_AGE_SECONDS` | Optional            | `604800`         | Cookie max age (7 days)            |

### Auth and JWT

| Variable                          | Required            | Default                      | Description                                    |
| --------------------------------- | ------------------- | ---------------------------- | ---------------------------------------------- |
| `AUTH_JWT_SECRET`                 | **Required** (prod) | `<set-jwt-secret>`           | JWT signing key                                |
| `AUTH_JWT_SECRET_FILE`            | Optional            | —                            | File path for JWT secret (Docker secret mount) |
| `AUTH_JWT_ISSUER`                 | Optional            | `https://auth.example.com`   | JWT issuer claim                               |
| `AUTH_JWT_AUDIENCE`               | Optional            | `nest-react-boilerplate-api` | JWT audience claim                             |
| `AUTH_JWT_EXPIRES_IN_SECONDS`     | Optional            | `3600`                       | JWT TTL (1 hour)                               |
| `AUTH_PERSISTENCE`                | Optional            | `postgres`                   | Auth token persistence: `postgres` or `memory` |
| `AUTH_TOKEN_CLEANUP_ENABLED`      | Optional            | `true`                       | Enable stale token cleanup                     |
| `AUTH_TOKEN_CLEANUP_INTERVAL_MS`  | Optional            | `3600000`                    | Cleanup interval (1 hour)                      |
| `AUTH_TOKEN_CLEANUP_RUN_ON_START` | Optional            | `true`                       | Run cleanup on boot                            |

### Admin bootstrap

| Variable                     | Required | Default | Description                     |
| ---------------------------- | -------- | ------- | ------------------------------- |
| `ADMIN_BOOTSTRAP_ENABLED`    | Optional | `false` | Enable admin user bootstrapping |
| `ADMIN_BOOTSTRAP_EMAILS`     | Optional | —       | Comma-separated admin emails    |
| `ADMIN_BOOTSTRAP_TENANT_IDS` | Optional | —       | Comma-separated tenant IDs      |

### External auth policy

| Variable                                  | Required | Default                    | Description                                  |
| ----------------------------------------- | -------- | -------------------------- | -------------------------------------------- |
| `EXTERNAL_AUTH_AUTO_PROVISION_ENABLED`    | Optional | `false`                    | Auto-create accounts on social login         |
| `EXTERNAL_AUTH_STEP_UP_MAX_AGE_SECONDS`   | Optional | `900`                      | Max age for step-up confirmation             |
| `EXTERNAL_AUTH_LINK_TOKEN_TTL_SECONDS`    | Optional | `600`                      | Link-token lifetime                          |
| `EXTERNAL_AUTH_STATE_TTL_SECONDS`         | Optional | `600`                      | OAuth/TMA state lifetime                     |
| `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY`      | Optional | `<set-32-byte-base64-key>` | Key for encrypting provider tokens at rest   |
| `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE` | Optional | —                          | File path for encryption key (Docker secret) |
| `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_ID`   | Optional | `primary`                  | Key identifier for rotation                  |

### Telegram

| Variable                           | Required                   | Default                    | Description                                         |
| ---------------------------------- | -------------------------- | -------------------------- | --------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`               | **Required** (bot enabled) | `<set-telegram-bot-token>` | Bot token from BotFather                            |
| `TELEGRAM_BOT_TOKEN_FILE`          | Optional                   | —                          | File path for bot token (Docker secret)             |
| `TELEGRAM_BOT_USERNAME`            | Optional                   | `example_bot`              | Bot username without `@`                            |
| `TELEGRAM_BOT_MODE`                | Optional                   | `webhook`                  | Bot mode: `webhook` or `polling`                    |
| `TELEGRAM_BOT_WEBHOOK_SECRET`      | Optional                   | —                          | Webhook verification secret                         |
| `TELEGRAM_BOT_WEBHOOK_SECRET_FILE` | Optional                   | —                          | File path for webhook secret (Docker secret)        |
| `TELEGRAM_BOT_WEBHOOK_URL`         | Optional                   | —                          | Public webhook URL                                  |
| `TELEGRAM_MINI_APP_URL`            | Optional                   | —                          | Telegram Mini App URL (must match BotFather config) |
| `TELEGRAM_AUTH_ENABLED`            | Optional                   | `false`                    | Enable Telegram social auth                         |
| `TELEGRAM_AUTH_BOT_USERNAME`       | Optional                   | `example_bot`              | Auth bot username                                   |
| `TELEGRAM_AUTH_MAX_AGE_SECONDS`    | Optional                   | `86400`                    | Init-data max age                                   |
| `TELEGRAM_AUTH_REPLAY_TTL_SECONDS` | Optional                   | `900`                      | Replay-cache TTL                                    |
| `TELEGRAM_BOT_MENU_BUTTON_ENABLED` | Optional                   | `false`                    | Enable persistent menu button                       |
| `TELEGRAM_LINK_TOKEN_TTL_SECONDS`  | Optional                   | `600`                      | Account-link token TTL                              |

### Discord

| Variable                                 | Required                   | Default                          | Description                                 |
| ---------------------------------------- | -------------------------- | -------------------------------- | ------------------------------------------- |
| `DISCORD_BOT_TOKEN`                      | **Required** (bot enabled) | `<set-discord-bot-token>`        | Bot token from Discord Developer Portal     |
| `DISCORD_BOT_TOKEN_FILE`                 | Optional                   | —                                | File path for bot token (Docker secret)     |
| `DISCORD_CLIENT_ID`                      | **Required** (OAuth)       | `example-discord-client-id`      | Application client ID                       |
| `DISCORD_APPLICATION_ID`                 | **Required** (bot enabled) | `example-discord-application-id` | Interactions application ID                 |
| `DISCORD_CLIENT_SECRET`                  | **Required** (OAuth)       | `<set-discord-client-secret>`    | Application client secret                   |
| `DISCORD_CLIENT_SECRET_FILE`             | Optional                   | —                                | File path for client secret (Docker secret) |
| `DISCORD_PUBLIC_KEY`                     | Optional                   | `<set-discord-public-key>`       | Interactions public key                     |
| `DISCORD_PUBLIC_KEY_FILE`                | Optional                   | —                                | File path for public key (Docker secret)    |
| `DISCORD_REDIRECT_URI`                   | Optional                   | —                                | OAuth callback URI                          |
| `DISCORD_SCOPES`                         | Optional                   | `identify email guilds.join`     | OAuth scopes                                |
| `DISCORD_AUTH_ENABLED`                   | Optional                   | `false`                          | Enable Discord social auth                  |
| `DISCORD_INTERACTIONS_ENDPOINT`          | Optional                   | —                                | Public interactions endpoint URL            |
| `DISCORD_INTERACTIONS_STATE_TTL_SECONDS` | Optional                   | `600`                            | Interactions state TTL                      |
| `DISCORD_COMMAND_REGISTRATION_ENABLED`   | Optional                   | `false`                          | Enable slash command registration           |

### OAuth

| Variable                   | Required                     | Default                     | Description                   |
| -------------------------- | ---------------------------- | --------------------------- | ----------------------------- |
| `AUTH_OAUTH_ENABLED`       | Optional                     | `false`                     | Enable generic OAuth provider |
| `AUTH_OAUTH_CLIENT_ID`     | Optional                     | `example-client-id`         | OAuth client ID               |
| `AUTH_OAUTH_CLIENT_SECRET` | **Required** (OAuth enabled) | `<set-oauth-client-secret>` | OAuth client secret           |
| `AUTH_OAUTH_SCOPES`        | Optional                     | `openid profile email`      | OAuth scopes                  |

### Email (SendGrid)

| Variable              | Required                     | Default | Description                  |
| --------------------- | ---------------------------- | ------- | ---------------------------- |
| `SENDGRID_API_KEY`    | **Required** (email enabled) | —       | SendGrid API key             |
| `SENDGRID_FROM_EMAIL` | Optional                     | —       | Default sender email address |
| `SENDGRID_FROM_NAME`  | Optional                     | —       | Default sender name          |

### Analytics (PostHog)

| Variable                 | Required | Default                   | Description             |
| ------------------------ | -------- | ------------------------- | ----------------------- |
| `POSTHOG_API_KEY`        | Optional | —                         | PostHog project API key |
| `ANALYTICS_POSTHOG_HOST` | Optional | `https://app.posthog.com` | PostHog host URL        |

### Object storage (S3 / MinIO)

| Variable                                  | Required                  | Default      | Description                      |
| ----------------------------------------- | ------------------------- | ------------ | -------------------------------- |
| `AWS_ACCESS_KEY_ID` / `S3_ACCESS_KEY`     | **Required** (S3 enabled) | `minioadmin` | S3 access key                    |
| `AWS_SECRET_ACCESS_KEY` / `S3_SECRET_KEY` | **Required** (S3 enabled) | `minioadmin` | S3 secret key                    |
| `S3_BUCKET`                               | **Required** (S3 enabled) | —            | S3 bucket name                   |
| `S3_ENDPOINT`                             | Optional                  | —            | Custom S3 endpoint (MinIO, etc.) |
| `S3_REGION`                               | Optional                  | —            | S3 region                        |

### Rate limiting

| Variable             | Required | Default | Description                           |
| -------------------- | -------- | ------- | ------------------------------------- |
| `RATE_LIMIT_ENABLED` | Optional | `true`  | Enable rate limiting                  |
| `RATE_LIMIT_MAX`     | Optional | `100`   | Max requests per window               |
| `RATE_LIMIT_STORE`   | Optional | `redis` | Rate limit store: `redis` or `memory` |

### Redis

| Variable      | Required                     | Default  | Description                           |
| ------------- | ---------------------------- | -------- | ------------------------------------- |
| `REDIS_HOSTS` | **Required** (Redis enabled) | —        | Redis host(s)                         |
| `REDIS_PORT`  | Optional                     | `6379`   | Redis port                            |
| `REDIS_MODE`  | Optional                     | `single` | Mode: `single`, `sentinel`, `cluster` |

### PostgreSQL (Docker/Compose)

| Variable                 | Required | Default                                                             | Description                               |
| ------------------------ | -------- | ------------------------------------------------------------------- | ----------------------------------------- |
| `CONTAINER_DATABASE_URL` | Optional | `postgres://postgres:postgres@postgres:5432/nest_react_boilerplate` | DB URL for Compose                        |
| `POSTGRES_DB`            | Optional | `nest_react_boilerplate`                                            | Database name                             |
| `POSTGRES_PASSWORD_FILE` | Optional | —                                                                   | File path for DB password (Docker secret) |

### NATS

| Variable                      | Required                    | Default                      | Description            |
| ----------------------------- | --------------------------- | ---------------------------- | ---------------------- |
| `NATS_URL` / `NATS_SERVERS`   | **Required** (NATS enabled) | —                            | NATS server URL(s)     |
| `NATS_USER`                   | Optional                    | —                            | NATS username          |
| `NATS_PASS`                   | Optional                    | —                            | NATS password          |
| `NATS_NAME`                   | Optional                    | `nest-react-boilerplate-api` | Client name for NATS   |
| `NATS_RECONNECT`              | Optional                    | `true`                       | Enable auto-reconnect  |
| `NATS_MAX_RECONNECT_ATTEMPTS` | Optional                    | `10`                         | Max reconnect attempts |
| `NATS_RECONNECT_TIME_WAIT_MS` | Optional                    | `2000`                       | Reconnect wait (ms)    |
| `NATS_PING_INTERVAL_MS`       | Optional                    | `120000`                     | Ping interval (ms)     |
| `NATS_DRAIN_TIMEOUT_MS`       | Optional                    | `5000`                       | Drain timeout (ms)     |

### OpenTelemetry / Observability

| Variable                              | Required                    | Default                      | Description                 |
| ------------------------------------- | --------------------------- | ---------------------------- | --------------------------- |
| `OTEL_ENABLED`                        | Optional                    | `false`                      | Enable OpenTelemetry SDK    |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         | **Required** (OTEL enabled) | `http://otel-collector:4318` | OTLP collector endpoint     |
| `OTEL_EXPORTER_OTLP_HEADERS`          | Optional                    | —                            | OTLP auth headers           |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  | Optional                    | —                            | Traces-specific endpoint    |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Optional                    | —                            | Metrics-specific endpoint   |
| `OTEL_METRIC_EXPORT_INTERVAL`         | Optional                    | `60000`                      | Metric export interval (ms) |

### OpenAPI

| Variable              | Required | Default | Description                    |
| --------------------- | -------- | ------- | ------------------------------ |
| `OPENAPI_ENABLED`     | Optional | —       | Enable OpenAPI spec generation |
| `OPENAPI_PATH`        | Optional | —       | Path to write OpenAPI JSON     |
| `OPENAPI_DESCRIPTION` | Optional | —       | API description for spec       |

### Docker / Images

| Variable         | Required | Default                                          | Description        |
| ---------------- | -------- | ------------------------------------------------ | ------------------ |
| `IMAGE_REGISTRY` | Optional | `ghcr.io/your-github-org/nest-react-boilerplate` | Container registry |
| `IMAGE_TAG`      | Optional | `sha-000000000000`                               | Image tag          |

---

## Per-environment examples

### Local development

```env
NODE_ENV=development
LOG_LEVEL=debug
LOG_FORMAT=pretty
GRACEFUL_SHUTDOWN=true

DATABASE_URL=postgres://postgres:postgres@localhost:5432/nest_react_boilerplate
SESSION_SECRET=dev-session-secret-do-not-use-in-prod
AUTH_JWT_SECRET=dev-jwt-secret-do-not-use-in-prod

ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_EMAILS=dev@example.com

TELEGRAM_BOT_TOKEN=your-dev-bot-token
TELEGRAM_BOT_MODE=polling

DISCORD_BOT_TOKEN=your-dev-bot-token

OPENAPI_ENABLED=true
OTEL_ENABLED=false
```

### Staging

```env
NODE_ENV=production
LOG_LEVEL=info
LOG_FORMAT=json
GRACEFUL_SHUTDOWN=true
TRUST_PROXY=true

DATABASE_URL_FILE=/run/secrets/database_url
SESSION_SECRET=<generated-256-bit-hex>
AUTH_JWT_SECRET_FILE=/run/secrets/auth_jwt_secret

ADMIN_BOOTSTRAP_ENABLED=false

CORS_ORIGINS=https://staging-admin.example.com,https://staging-app.example.com

TELEGRAM_BOT_TOKEN_FILE=/run/secrets/telegram_bot_token
TELEGRAM_BOT_MODE=webhook
TELEGRAM_BOT_WEBHOOK_URL=https://staging-telegram-api.example.com/telegram/webhook

DISCORD_BOT_TOKEN_FILE=/run/secrets/discord_bot_token

OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318

RATE_LIMIT_ENABLED=true
RATE_LIMIT_STORE=redis
REDIS_HOSTS=redis:6379
```

### Production

```env
NODE_ENV=production
LOG_LEVEL=warn
LOG_FORMAT=json
GRACEFUL_SHUTDOWN=true
TRUST_PROXY=true
CONTAINER=prod-cluster-1

DATABASE_URL_FILE=/run/secrets/database_url
SESSION_SECRET_FILE=/run/secrets/session_secret
AUTH_JWT_SECRET_FILE=/run/secrets/auth_jwt_secret

ADMIN_BOOTSTRAP_ENABLED=false

CORS_ORIGINS=https://admin.example.com,https://app.example.com,https://example.com,https://site.example.com,https://mobile.example.com

TELEGRAM_BOT_TOKEN_FILE=/run/secrets/telegram_bot_token
TELEGRAM_BOT_MODE=webhook
TELEGRAM_BOT_WEBHOOK_SECRET_FILE=/run/secrets/telegram_webhook_secret
TELEGRAM_BOT_WEBHOOK_URL=https://telegram-api.example.com/telegram/webhook
TELEGRAM_MINI_APP_URL=https://app.example.com/telegram-mini-app

DISCORD_BOT_TOKEN_FILE=/run/secrets/discord_bot_token
DISCORD_CLIENT_SECRET_FILE=/run/secrets/discord_client_secret

SENDGRID_API_KEY_FILE=/run/secrets/sendgrid_api_key

S3_ACCESS_KEY_FILE=/run/secrets/s3_access_key
S3_SECRET_KEY_FILE=/run/secrets/s3_secret_key
S3_BUCKET=prod-nrb-assets

OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_EXPORTER_OTLP_HEADERS_FILE=/run/secrets/otel_headers

RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=100
RATE_LIMIT_STORE=redis
REDIS_HOSTS=redis-sentinel:26379
REDIS_MODE=sentinel
```
