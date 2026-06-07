# API contracts

## Decision

REST contracts are standardized on the NestJS Swagger/OpenAPI documents produced by the backend apps. `openapi-typescript` generates shared contract review types in `libs/common/api-contracts` and frontend per-service client types in `libs/frontend/api-client/lib/src/generated`. Frontend runtime clients are built with `openapi-fetch` and `openapi-react-query`; Orval is not used.

## Rationale

- Nest controllers remain the source of truth for routes, request/response shapes, auth metadata, and documented problem responses.
- OpenAPI JSON is committed under `contracts/openapi/` for review, audits, and external client generation.
- Shared generated TypeScript contract types live in `libs/common/api-contracts` for DTO/path review.
- Frontend service wrappers in `@app/api-client` hide endpoint path strings from apps while preserving typed `{ data, error, response }`, typed React Query helpers, bearer headers, base URLs, and locale handling.

## Workflow

- Run `pnpm api:contracts` after changing controller DTOs, routes, auth decorators, response wrappers, or error metadata.
- Run `pnpm api:contracts:check` in CI/checks to export auth, user, and admin OpenAPI JSON into a temp directory, regenerate TS contract types, and compare with committed files.
- Run `pnpm api:clients` after OpenAPI changes and `pnpm api:clients:check` to verify committed frontend clients are fresh.
- `pnpm run check` includes both contract and client freshness checks before lint/typecheck/tests.

## Migration rules and pitfalls

- Keep runtime behavior in controllers unchanged; Swagger DTO classes describe existing responses only.
- Use `@ApiBearerAuth`, `@ApiProblemExceptions`, and `@ApiOkDataResponse` on endpoints consumed by frontends.
- Import generated service functions/types from `@app/api-client` in frontend apps instead of re-declaring DTO/envelope types or importing `@app/api-contracts` directly.
- Do not put endpoint path strings in app code; path strings belong in `libs/frontend/api-client` wrappers and generated artifacts.
- Treat generated files as read-only; fix source decorators/DTOs, OpenAPI metadata, or generator scripts and regenerate.
- Be careful with optional frontend handling: generated contracts describe successful backend responses, while UI code may still handle missing data during failed/partial requests.
