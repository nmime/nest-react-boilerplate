# Presets and technologies

The monorepo has no default application. Presets are exact shortcuts; the saved selection is explicit and can be rerun to add or remove applications and capabilities.

## Applications

The generated [Project Catalog](../project-catalog.md) owns the complete app
matrix: exact IDs, Nx roots, runtimes, reference/optional classification,
template hostnames, and dependency closure. This guide owns only preset and
capability behavior.

## Presets

| Preset       | Purpose                                                    |
| ------------ | ---------------------------------------------------------- |
| `minimal`    | Auth and user APIs with PostgreSQL.                        |
| `web`        | All browser apps, core APIs, and full-stack E2E.           |
| `fullstack`  | Web plus Expo mobile. Bot applications remain opt-in.      |
| `bots`       | Telegram and Discord APIs plus the core auth/user backend. |
| `enterprise` | Every supported app and capability.                        |

## Capabilities

Capabilities are executable selections, not labels. Each catalog entry declares its activation class, dependencies, owning Nx projects, Docker services, environment contract, and backend module/bootstrap wiring.

| Capability      | Activation                      | Dependencies / concrete effect                                                                                                         |
| --------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `i18n`          | source libraries                | Backend common, frontend shared/feature catalogs, common runtime and keys.                                                             |
| `analytics`     | Nest module                     | Generates `AnalyticsModule.forRoot()` composition.                                                                                     |
| `websockets`    | source library                  | Enables the provider-neutral websocket contracts.                                                                                      |
| `feature-flags` | Nest module                     | Requires PostgreSQL; wires the Postgres feature-flag module.                                                                           |
| `notifications` | Nest module + scheduler         | Requires PostgreSQL and `notification-scheduler`; wires producer modules in selected APIs and runs provider delivery in the scheduler. |
| `design-tokens` | source library                  | Enables renderer-neutral tokens, required by native UI.                                                                                |
| `authz`         | source library                  | Enables shared authorization contracts/policies.                                                                                       |
| `postgres`      | infrastructure                  | Enables `postgres` and `migrate` Compose services and `DATABASE_URL`.                                                                  |
| `redis`         | Nest module + infrastructure    | Wires `RedisModule.forRoot()` and the Redis Compose service.                                                                           |
| `s3`            | Nest module + infrastructure    | Wires the AWS SDK v3-backed `S3Module.forRoot()` and local MinIO profile; the configured bucket must already exist.                    |
| `static-data`   | Nest module                     | Wires filesystem static-data access.                                                                                                   |
| `nats`          | Nest module + infrastructure    | Wires `NatsModule.forRoot()` and NATS.                                                                                                 |
| `otel`          | bootstrap                       | Enables OpenTelemetry bootstrap environment.                                                                                           |
| `swagger`       | bootstrap                       | Enables OpenAPI bootstrap environment.                                                                                                 |
| `telegram-bot`  | optional application capability | Selects `telegram-bot-api` and its Telegram environment contract.                                                                      |
| `discord-bot`   | optional application capability | Selects `discord-app-api` and its Discord environment contract.                                                                        |

Setup materializes this into `.nrb/capabilities.json`, `.nrb/capabilities.env`, `.nrb/workspace.json`, and one `capabilities.generated.ts` per backend application. Rerunning setup regenerates all managed modules, so removing a capability also removes stale imports/wiring. `pnpm nrb doctor` fails when generated activation drifts from the saved selection.

Run selected infrastructure/apps with:

```bash
pnpm run docker:selected
```

Use `pnpm run docker:fullstack` only when intentionally starting every Compose profile.

## Dependency expansion example

Selecting `notifications` expands to `postgres` and `notification-scheduler`. Telegram and Discord are independent provider integrations, not prerequisites for email or other notification providers. Selecting `admin-app` expands to both required APIs and authorization/PostgreSQL requirements. Expansion is deterministic and dependency-breaking removals fail.
