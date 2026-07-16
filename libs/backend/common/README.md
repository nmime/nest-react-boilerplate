# Backend common library catalog

`libs/backend/common` contains reusable backend building blocks. These libraries may depend on narrower backend/common or platform-neutral contracts, but never on deployable apps, product features, feature-owned PostgreSQL adapters, bots, or frontend code.

| Library           | Role                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| `analytics`       | Analytics provider/module adapter.                                         |
| `bootstrap`       | Nest/Fastify process bootstrap composition.                                |
| `component-test`  | Testcontainers-backed backend test utilities.                              |
| `exception`       | RFC 9457 exception primitives and factory.                                 |
| `health`          | Health controllers, indicators, and shutdown contracts.                    |
| `i18n`            | Backend common/error catalogs and request-locale helpers; no bot catalogs. |
| `logger`          | Backend logger construction.                                               |
| `nats`            | NATS/JetStream clients and health composition.                             |
| `network`         | Framework-neutral network predicates/constants.                            |
| `otel`            | OpenTelemetry runtime setup.                                               |
| `redis`           | Redis clients, cache, rate limiting, locks, and health.                    |
| `request-context` | AsyncLocalStorage request context and request ID propagation.              |
| `response`        | Success/result mapping and RFC 9457 HTTP filters.                          |
| `s3`              | S3-compatible storage adapter.                                             |
| `static`          | Filesystem-backed static JSON data access.                                 |
| `swagger`         | OpenAPI/Swagger setup for Nest APIs.                                       |
| `validation`      | Validation pipes/decorators and problem responses.                         |

There is intentionally no `backend-common-shared`, `intl`, or generic `test` package. Put a primitive in the narrow library that owns its concern; put feature behavior under `libs/backend/feature/<scope>`; put persistence under `libs/backend/postgres`; and keep cross-runtime contracts under `libs/common`.

Boundary tags used here are `boundary:backend-kernel`, `boundary:infrastructure-adapter`, `boundary:interface-helper`, `boundary:test-util`, and `boundary:i18n`. Nx enforces platform, semantic type, scope, and framework-neutral constraints.
