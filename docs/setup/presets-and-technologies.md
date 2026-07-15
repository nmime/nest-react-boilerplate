# Presets and Technologies

This page documents the five canonical presets, all supported apps and capabilities, and their dependency rules.

## Presets

| Preset       | Description                                      | Apps (before expansion)                                                                                  | Capabilities (before expansion)                                          |
| ------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `minimal`    | Single API with auth — minimal backend footprint | `auth-app-api`, `user-app-api`                                                                           | `postgres`                                                               |
| `starter`    | User product app + backend + auth                | `user-app`, `user-app-api`, `auth-app-api`                                                               | `postgres`, `design-tokens`, `i18n`                                      |
| `fullstack`  | All core apps with standard capabilities         | `admin-app`, `admin-app-api`, `user-app`, `user-app-api`, `auth-app-api`, `landing-app`, `fullstack-e2e` | `postgres`, `redis`, `design-tokens`, `authz`, `i18n`, `otel`, `swagger` |
| `enterprise` | Every supported app and capability               | All apps                                                                                                 | All capabilities                                                         |
| `bots`       | Telegram + Discord bots with workers             | `auth-app-api`, `user-app-api`, `telegram-bot-api`, `telegram-bot-worker`, `discord-app-api`             | `postgres`, `redis`, `telegram-bot`, `discord-bot`, `otel`               |

Presets act as starting points. Explicit `apps` and `capabilities` in the config override or extend the preset. Transitive dependencies are auto-expanded.

## Supported applications

### Frontend apps

| ID            | Label            | Platform | Requires capabilities    | Requires apps                  |
| ------------- | ---------------- | -------- | ------------------------ | ------------------------------ |
| `admin-app`   | Admin Dashboard  | frontend | `authz`, `design-tokens` | `admin-app-api`                |
| `user-app`    | User Application | frontend | `design-tokens`, `i18n`  | `user-app-api`, `auth-app-api` |
| `landing-app` | Landing Page     | frontend | _(none)_                 | _(none)_                       |
| `site-app`    | Marketing Site   | frontend | _(none)_                 | _(none)_                       |
| `mobile-app`  | Mobile App       | frontend | `design-tokens`          | `user-app-api`                 |

### Backend apps

| ID                    | Label               | Platform | Requires capabilities      | Requires apps      |
| --------------------- | ------------------- | -------- | -------------------------- | ------------------ |
| `admin-app-api`       | Admin API           | backend  | `postgres`, `authz`        | _(none)_           |
| `user-app-api`        | User API            | backend  | `postgres`                 | _(none)_           |
| `auth-app-api`        | Auth API            | backend  | `postgres`                 | _(none)_           |
| `discord-app-api`     | Discord Bot API     | backend  | `discord-bot`, `postgres`  | _(none)_           |
| `telegram-bot-api`    | Telegram Bot API    | backend  | `telegram-bot`, `postgres` | _(none)_           |
| `telegram-bot-worker` | Telegram Bot Worker | backend  | `telegram-bot`, `redis`    | `telegram-bot-api` |

### E2E apps

| ID              | Label               | Platform | Requires capabilities | Requires apps                  |
| --------------- | ------------------- | -------- | --------------------- | ------------------------------ |
| `fullstack-e2e` | Fullstack E2E Tests | e2e      | _(none)_              | `auth-app-api`, `user-app-api` |

## Supported capabilities

| ID              | Label                       | Requires capabilities | Conflicts with |
| --------------- | --------------------------- | --------------------- | -------------- |
| `i18n`          | Internationalization        | _(none)_              | _(none)_       |
| `analytics`     | Analytics Tracking          | _(none)_              | _(none)_       |
| `websockets`    | WebSockets                  | _(none)_              | _(none)_       |
| `feature-flags` | Feature Flags               | _(none)_              | _(none)_       |
| `notifications` | Notifications               | `redis`               | _(none)_       |
| `design-tokens` | Design Tokens               | _(none)_              | _(none)_       |
| `authz`         | Authorization               | _(none)_              | _(none)_       |
| `postgres`      | PostgreSQL Database         | _(none)_              | _(none)_       |
| `redis`         | Redis Cache                 | _(none)_              | _(none)_       |
| `s3`            | S3 Object Storage           | _(none)_              | _(none)_       |
| `nats`          | NATS Messaging              | _(none)_              | _(none)_       |
| `otel`          | OpenTelemetry Observability | _(none)_              | _(none)_       |
| `swagger`       | Swagger API Docs            | _(none)_              | _(none)_       |
| `telegram-bot`  | Telegram Bot Integration    | _(none)_              | _(none)_       |
| `discord-bot`   | Discord Bot Integration     | _(none)_              | _(none)_       |

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
- [CLI Reference](cli-reference.md) — command-line flags for `pnpm nrb setup`.
