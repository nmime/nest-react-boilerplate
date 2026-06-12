# API contracts

## Decision

REST contracts are standardized on the NestJS Swagger/OpenAPI documents produced by the backend apps. `openapi-typescript` generates shared contract review types in `libs/common/api-contracts` and frontend per-service client types in `libs/frontend/api-client/lib/src/generated`. Frontend runtime clients are built with `openapi-fetch` and `openapi-react-query`; Orval is not used.

## Rationale

- Nest controllers remain the source of truth for routes, request/response shapes, auth metadata, and documented problem responses.
- OpenAPI JSON is committed under `apps/backend/*-app-api-contracts/openapi/` for review, audits, and external client generation.
- Shared generated TypeScript contract types live in `libs/common/api-contracts` for DTO/path review.
- Frontend service wrappers in `@app/api-client` hide endpoint path strings from apps while preserving typed `{ data, error, response }`, typed React Query helpers, bearer headers, base URLs, and locale handling.

## Workflow

- Run `pnpm api:contracts` after changing controller DTOs, routes, auth decorators, response wrappers, or error metadata.
- Run `pnpm api:contracts:check` in CI/checks to export auth, user, and admin OpenAPI JSON into a temp directory, regenerate TS contract types, and compare with committed files.
- Run `pnpm api:clients` after OpenAPI changes and `pnpm api:clients:check` to verify committed frontend clients are fresh.
- `pnpm run check` includes both contract and client freshness checks before lint/typecheck/tests.

## Migration rules and pitfalls

- Keep runtime behavior in controllers unchanged; Swagger DTO classes describe existing responses only.
- Use `@ApiBearerAuth`, `@ApiExceptions`, and `@ApiOkDataResponse` on endpoints consumed by frontends.
- Import generated service functions/types from `@app/api-client` in frontend apps instead of re-declaring DTO/envelope types or importing `@app/api-contracts` directly.
- Do not put endpoint path strings in app code; path strings belong in `libs/frontend/api-client` wrappers and generated artifacts.
- Treat generated files as read-only; fix source decorators/DTOs, OpenAPI metadata, or generator scripts and regenerate.
- Be careful with optional frontend handling: generated contracts describe successful backend responses, while UI code may still handle missing data during failed/partial requests.

## Current contract layout and ownership

| Surface                    | Current path or owner                                                                                                                                                              | Notes                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| OpenAPI artifacts          | `apps/backend/*-app-api-contracts/openapi/*.json`                                                                                                                                  | One committed producer JSON artifact per backend API.                    |
| Auth OpenAPI               | `apps/backend/auth-app-api-contracts/openapi/auth-app-api.json`                                                                                                                    | Produced from `auth-app-api`.                                            |
| User OpenAPI               | `apps/backend/user-app-api-contracts/openapi/user-app-api.json`                                                                                                                    | Produced from `user-app-api`.                                            |
| Admin OpenAPI              | `apps/backend/admin-app-api-contracts/openapi/admin-app-api.json`                                                                                                                  | Produced from `backend-admin-app-api`; manifest name is `admin-app-api`. |
| Consumer Pact              | `apps/frontend/app-contracts/consumers/frontend-auth.pact.json`                                                                                                                    | Current frontend consumer contract for auth flows.                       |
| Shared generated TS        | `libs/common/api-contracts/lib/src/generated/**`                                                                                                                                   | Review/DTO/path types generated from OpenAPI.                            |
| Frontend generated clients | `libs/frontend/api-client/lib/src/generated/**`                                                                                                                                    | Per-service generated client types used by wrappers.                     |
| Manifest/layout            | `config/api-contracts.json`, `config/api-contracts.schema.json`, `packages/tooling/src/commands/api/contract-layout.ts`, `packages/tooling/src/commands/api/contracts-manifest.ts` | Authoritative local contract inventory.                                  |
| Absent by design           | No repository-root contract artifact directory; no `openapi` or `consumers` artifact subtree under `libs/common/api-contracts`.                                                    | Keep artifacts with apps and generated source with libraries.            |

| Contract owner         | Artifacts                                                       | Consumers                                                 | Local check                       |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| Auth REST API          | auth OpenAPI, `auth-app-api.ts`, `auth.ts`                      | `@app/api-client` auth namespace and `frontend-auth` Pact | `pnpm run api:contracts:check`    |
| User REST API          | user OpenAPI, `user-app-api.ts`, `user.ts`                      | `@app/api-client` user namespace                          | `pnpm run api:contracts:check`    |
| Admin REST API         | admin OpenAPI, `admin-app-api.ts`, `admin.ts`                   | `@app/api-client` admin namespace                         | `pnpm run api:contracts:check`    |
| Frontend auth consumer | `apps/frontend/app-contracts/consumers/frontend-auth.pact.json` | Auth provider verification/review                         | consumer-contract check when used |

## Contract pipeline diagram

```mermaid
flowchart LR
  Controllers[Nest controllers, DTOs, decorators<br/>@ApiBearerAuth / @ApiExceptions / @ApiOkDataResponse]
  Swagger[Swagger export tooling]
  OpenApi[Committed OpenAPI JSON<br/>apps/backend/*-app-api-contracts/openapi/*.json]
  Manifest[config/api-contracts.json<br/>schema + layout helpers]
  SharedTypes[Generated shared TS<br/>libs/common/api-contracts/lib/src/generated/**]
  FrontendGenerated[Generated frontend clients<br/>libs/frontend/api-client/lib/src/generated/**]
  Wrappers[@app/api-client wrappers<br/>authApi / userApi / adminApi]
  Frontends[frontend apps]
  Pact[consumer Pact<br/>apps/frontend/app-contracts/consumers/frontend-auth.pact.json]
  Checks[Freshness checks]
  Controllers --> Swagger --> OpenApi
  Manifest --> Swagger
  Manifest --> SharedTypes
  Manifest --> FrontendGenerated
  OpenApi --> SharedTypes --> FrontendGenerated --> Wrappers --> Frontends
  Frontends --> Pact --> Checks
  OpenApi --> Checks
  SharedTypes --> Checks
  FrontendGenerated --> Checks
```

## Distributed-contract note

Contract verification is currently local to the monorepo: committed OpenAPI artifacts, generated TypeScript, frontend generated clients, and the checked-in consumer Pact are validated from repository state. There is no remote Pact broker, schema registry, or distributed contract promotion workflow yet. If independently deployed consumers/providers are introduced, add broker-backed publishing, provider verification, environment tags, and release promotion rules without moving the current local artifact layout.
