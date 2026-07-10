# Presets and Technologies

This page documents the five canonical presets, all supported apps and capabilities, and their dependency rules.

## Presets

| Preset       | Description                                      | Apps (before expansion)                         | Capabilities (before expansion)         |
| ------------ | ------------------------------------------------ | ----------------------------------------------- | --------------------------------------- |
| `minimal`    | Single API with auth — minimal backend footprint | `auth-app-api`, `user-app-api`                  | `postgres`                              |
| `starter`    | One frontend + backend + auth — MVP-ready        | `user-app`, `user-app-api`, `auth-app-api`      | `postgres`, `design-tokens`, `i18n`     |
| `fullstack`  | All core apps with standard capabilities         | `admin-app`, `admin-app-api`, `user-app`, `user-app-api`, `auth-app-api`, `landing-app`, `fullstack-e2e` | `postgres`, `redis`, `design-tokens`, `authz`, `i18n`, `otel`, `swagger` |
| `enterprise` | Every supported app and capability               | All apps                                        | All capabilities                        |
| `bots`       | Telegram + Discord bots with workers             | `auth-app-api`, `user-app-api`, `telegram-bot-api`, `telegram-bot-worker`, `discord-app-api` | `postgres`, `redis`, `telegram-bot`, `discord-bot`, `otel` |

Presets act as starting points. Explicit `apps` and `capabilities` in the config override or extend the preset. Transitive dependencies are auto-expanded.

## Supported applications

### Frontend apps

| ID             | Label           | Platform  | Requires capabilities       | Requires apps    |
| -------------- | --------------- | --------- | --------------------------- | ---------------- |
| `admin-app`    | Admin Dashboard | frontend  | `authz`, `design-tokens`    | `admin-app-api`  |
| `user-app`     | User Application| frontend  | `design-tokens`             | `user-app-api`   |
| `landing-app`  | Landing Page    | frontend  | *(none)*                    | *(none)*         |
| `site-app`     | Marketing Site  | frontend  | *(none)*                    | *(none)*         |
| `mobile-app`   | Mobile App      | frontend  | `design-tokens`             | `user-app-api`   |

### Backend apps

| ID                  | Label               | Platform | Requires capabilities       | Requires apps        |
| ------------------- | ------------------- | -------- | --------------------------- | -------------------- |
| `admin-app-api`     | Admin API           | backend  | `postgres`, `authz`         | *(none)*             |
| `user-app-api`      | User API            | backend  | `postgres`                  | *(none)*             |
| `auth-app-api`      | Auth API            | backend  | `postgres`                  | *(none)*             |
| `discord-app-api`   | Discord Bot API     | backend  | `discord-bot`, `postgres`   | *(none)*             |
| `telegram-bot-api`  | Telegram Bot API    | backend  | `telegram-bot`, `postgres`  | *(none)*             |
| `telegram-bot-worker` | Telegram Bot Worker | backend | `telegram-bot`, `redis`     | `telegram-bot-api`   |

### E2E apps

| ID              | Label               | Platform | Requires capabilities | Requires apps              |
| --------------- | ------------------- | -------- | --------------------- | -------------------------- |
| `fullstack-e2e` | Fullstack E2E Tests | e2e      | *(none)*              | `auth-app-api`, `user-app-api` |

## Supported capabilities

| ID                  | Label                          | Requires capabilities | Conflicts with |
| ------------------- | ------------------------------ | --------------------- | -------------- |
| `i18n`              | Internationalization           | *(none)*              | *(none)*       |
| `analytics`         | Analytics Tracking             | *(none)*              | *(none)*       |
| `websockets`        | WebSockets                     | *(none)*              | *(none)*       |
| `feature-flags`     | Feature Flags                  | *(none)*              | *(none)*       |
| `notifications`     | Notifications                  | `redis`               | *(none)*       |
| `design-tokens`     | Design Tokens                  | *(none)*              | *(none)*       |
| `authz`             | Authorization                  | *(none)*              | *(none)*       |
| `postgres`          | PostgreSQL Database            | *(none)*              | *(none)*       |
| `redis`             | Redis Cache                    | *(none)*              | *(none)*       |
| `s3`                | S3 Object Storage              | *(none)*              | *(none)*       |
| `nats`              | NATS Messaging                 | *(none)*              | *(none)*       |
| `otel`              | OpenTelemetry Observability    | *(none)*              | *(none)*       |
| `swagger`           | Swagger API Docs               | *(none)*              | *(none)*       |
| `telegram-bot`      | Telegram Bot Integration       | *(none)*              | *(none)*       |
| `discord-bot`       | Discord Bot Integration        | *(none)*              | *(none)*       |

## Dependency expansion rules

The catalog engine resolves transitive dependencies automatically:

1. **App → Capability**: if `admin-app` is selected, `authz` and `design-tokens` are auto-enabled.
2. **App → App**: if `admin-app` is selected, `admin-app-api` is auto-enabled.
3. **Capability → Capability**: if `notifications` is selected, `redis` is auto-enabled.
4. **Conflict detection**: the planner errors if a selected app conflicts with an enabled capability.

### Example: dependency chain

Selecting `telegram-bot-worker` triggers:

1. Requires `telegram-bot-api` (app → app).
2. Requires `telegram-bot` (capability).
3. Requires `redis` (capability).

The final resolved set includes all four.

## Schema version

Current schema version: `1.0.0`. The planner rejects configs with mismatched schema versions.

## Next steps

- [Setup and Configuration](configuration.md) — interactive and noninteractive setup.
- [CLI Reference](cli-reference.md) — command-line flags for `nrb setup`.
