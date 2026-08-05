# Presets and technologies

The monorepo selection is explicit: presets are exact shortcuts, the saved
selection is rerunnable, and the committed upstream reference selection only
exists so maintainers can run every surface.

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

| Capability      | Activation                       | Dependencies / concrete effect                                                                                                                                                                    |
| --------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18n`          | source libraries                 | Backend common, frontend shared/feature catalogs, common runtime and keys.                                                                                                                        |
| `analytics`     | Nest module                      | Generates `AnalyticsModule.forRoot()` composition.                                                                                                                                                |
| `websockets`    | source library                   | Enables the provider-neutral websocket contracts.                                                                                                                                                 |
| `feature-flags` | Nest module                      | Requires exactly one durable provider; both adapters exist, but the current setup catalog still emits PostgreSQL wiring (see limitation below).                                                   |
| `notifications` | Nest module + consumer/scheduler | Requires exactly one durable provider, S3, `notification-consumer`, and `notification-scheduler`; APIs produce commands, the consumer materializes audiences, and the scheduler sends deliveries. |
| `design-tokens` | source library                   | Enables renderer-neutral tokens, required by native UI.                                                                                                                                           |
| `authz`         | source library                   | Enables shared authorization contracts/policies.                                                                                                                                                  |
| `postgres`      | infrastructure                   | Enables `postgres` and `migrate` Compose services and `DATABASE_URL`.                                                                                                                             |
| `mongodb`       | infrastructure                   | Mutually exclusive PostgreSQL alternative; enables a one-node local replica set plus preparation/migration services and the `MONGODB_*` contract.                                                 |
| `redis`         | Nest module + infrastructure     | Wires `RedisModule.forRoot()` and the Redis Compose service.                                                                                                                                      |
| `s3`            | Nest module + infrastructure     | Wires the AWS SDK v3-backed `S3Module.forRoot()` and local MinIO profile; the configured bucket must already exist.                                                                               |
| `static-data`   | Nest module                      | Wires filesystem static-data access.                                                                                                                                                              |
| `nats`          | Nest module + infrastructure     | Wires `NatsModule.forRoot()` and NATS.                                                                                                                                                            |
| `otel`          | bootstrap                        | Enables OpenTelemetry bootstrap environment.                                                                                                                                                      |
| `swagger`       | bootstrap                        | Enables OpenAPI bootstrap environment.                                                                                                                                                            |
| `telegram-bot`  | optional application capability  | Selects `telegram-bot-api`, Redis-backed webhook replay protection, and its Telegram environment contract.                                                                                        |
| `discord-bot`   | optional application capability  | Selects `discord-app-api`, Redis-backed interaction replay protection, and its Discord environment contract.                                                                                      |

Setup materializes this into `.nrb/capabilities.json`, `.nrb/capabilities.env`, `.nrb/workspace.json`, `.nrb/closure.json`, the selected pnpm closure manifests, and one module-composition `capabilities.generated.ts` plus one pre-import `capabilities.bootstrap.generated.ts` per backend application. Rerunning setup regenerates all managed surfaces, so removing a capability also removes stale imports/wiring. `pnpm nrb doctor` fails when generated activation or the live Nx closure drifts from the saved selection.

Run selected infrastructure/apps with:

```bash
pnpm run docker:selected
```

`pnpm run docker:fullstack` is an alias for the same command and starts the same
setup-selected profiles; neither command starts every Compose profile.

## Dependency expansion example

Every current preset explicitly includes PostgreSQL and remains unchanged unless
the operator swaps it for MongoDB. Database-dependent apps and the
`feature-flags`/`notifications` capabilities require exactly one durable
provider, rather than PostgreSQL specifically. Selecting `notifications` also
adds S3, `notification-consumer`, and `notification-scheduler`; selecting
`admin-app` adds both required APIs and authorization. Telegram and Discord are
independent provider integrations, not prerequisites for email or push
providers. Expansion is deterministic and dependency-breaking removals fail.

### Provider-aware setup

Feature flags and notifications resolve their owned persistence projects and
backend wiring from the selected durable provider. Swapping a valid selection
from PostgreSQL to MongoDB therefore replaces the provider-specific projects,
generated module imports, Compose profile, and environment selectors together.
Selections such as a standalone landing app may intentionally omit both durable
providers; database-dependent apps and capabilities still require exactly one.
