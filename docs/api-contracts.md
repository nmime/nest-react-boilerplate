# API contracts

## Decision

REST contracts are standardised on the NestJS Swagger/OpenAPI document already produced by the backend apps. Shared DTO/path types are generated with `openapi-typescript`, and frontend service clients are generated with Orval while preserving the existing runtime stack: REST endpoints, TanStack Query, the shared `apiFetch` helper, MobX shell state, and i18n/locale handling.

## Rationale

- Nest controllers remain the source of truth for request/response shapes and auth/error metadata.
- OpenAPI JSON is committed under `docs/openapi/` for review, audits, and external clients.
- Generated TypeScript contract types live in `libs/common/api-contracts` for shared DTO/path review.
- Generated per-service frontend clients live in `libs/frontend/api-client` and call the shared `apiFetch` transport through the Orval mutator, so auth headers, response transformation, locale persistence, and query invalidation behavior stay centralized.

## Alternatives considered

- **Shared DTO-only library:** lightweight, but it does not describe paths, auth, errors, or external API contracts.
- **Manual frontend clients only:** simple initially, but it duplicates endpoint/request typing and does not scale as services grow.
- **openapi-fetch:** good typed REST client, but would replace `apiFetch`; keep as a possible phase 2.
- **ts-rest/Zod:** strong end-to-end typing and validation, but requires parallel contract definitions and broader controller changes.
- **tRPC:** excellent for TypeScript-only RPC, but changes the REST contract and external client story.
- **GraphQL codegen:** valuable for graph-shaped APIs, but unnecessary for current resource endpoints and would add schema/resolver complexity.

## Workflow

- Run `pnpm api:contracts` after changing controller DTOs, routes, auth decorators, or response shapes.
- Run `pnpm api:contracts:check` in CI/checks to export auth, user, and admin OpenAPI JSON into a temp directory, regenerate TS types, and compare with committed files.
- Run `pnpm api:clients` after OpenAPI changes and `pnpm api:clients:check` to verify committed Orval clients are fresh.
- `pnpm run check` includes both contract and client freshness checks before lint/typecheck/tests.

## Migration rules and pitfalls

- Keep runtime behavior in controllers unchanged; Swagger DTO classes describe existing responses only.
- Use `@ApiBearerAuth`, `@ApiProblemExceptions`, and `@ApiOkDataResponse` on practical endpoints that frontends consume.
- Prefer importing generated service functions/types from `@app/api-client` in frontend apps instead of re-declaring payload/envelope types.
- Treat generated files as read-only; fix source decorators/DTOs, OpenAPI metadata, or Orval config and regenerate.
- Be careful with optional frontend handling: generated contracts describe successful backend responses, while UI code may still receive missing data during failed/partial requests.
