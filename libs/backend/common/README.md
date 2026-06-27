# Backend common clean-boundary catalog

`libs/backend/common` contains reusable backend building blocks only. These libraries must stay independent of application slices, backend feature modules, bots, persistence domains, and frontend code.

| Library          | Clean role                     | Boundary note                                                                  |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `analytics`      | Infrastructure adapter wrapper | Wraps analytics provider delivery behind backend configuration/module APIs.    |
| `api`            | Interface/framework helper     | Hosts HTTP endpoint/client transport helpers, not feature use cases.           |
| `bootstrap`      | Interface/framework helper     | Composes Nest/Fastify process bootstrap concerns for apps.                     |
| `component-test` | Test util                      | Provides backend component-test containers and setup helpers.                  |
| `exception`      | Shared backend kernel          | Defines backend-neutral exception/problem-details primitives.                  |
| `feature-flags`  | Interface/framework helper     | Adapts shared feature-flag contracts into a Nest backend module.               |
| `format`         | Interface/framework helper     | Provides backend formatting services and configuration.                        |
| `health`         | Interface/framework helper     | Provides health controllers, indicators, guards, and shutdown helpers.         |
| `intl`           | Interface/framework helper     | Provides backend locale context/resolver utilities without owning catalogs.    |
| `logger`         | Infrastructure adapter wrapper | Centralizes backend logger construction.                                       |
| `nats`           | Infrastructure adapter wrapper | Wraps NATS clients, JetStream, KV, object store, services, and health checks.  |
| `network`        | Shared backend kernel          | Defines backend-neutral network constants and predicates.                      |
| `otel`           | Infrastructure adapter wrapper | Wraps OpenTelemetry runtime setup and processors.                              |
| `redis`          | Infrastructure adapter wrapper | Wraps Redis clients, cache, rate limit, locks, and health checks.              |
| `response`       | Interface/framework helper     | Maps backend results/exceptions to HTTP and websocket response shapes.         |
| `s3`             | Infrastructure adapter wrapper | Wraps S3 storage operations and errors.                                        |
| `shared`         | Shared backend kernel          | Owns small backend-neutral primitives, DTOs, decorators, types, and utilities. |
| `static`         | Infrastructure adapter wrapper | Wraps filesystem-backed static JSON data access.                               |
| `swagger`        | Interface/framework helper     | Builds OpenAPI/Swagger integration for Nest APIs.                              |
| `test`           | Test util                      | Provides lightweight unit-test helpers and mocks.                              |
| `validation`     | Interface/framework helper     | Hosts validation pipes/decorators/exceptions for framework input boundaries.   |

Boundary tags in each `project.json` mirror this catalog:

- `boundary:backend-kernel`
- `boundary:infrastructure-adapter`
- `boundary:interface-helper`
- `boundary:test-util`

Backend common libraries may depend on other backend/common or shared platform utilities when needed, but must not import apps, backend feature/domain modules, backend postgres modules, bots, or frontend libraries.
