# API contracts

## Decision

Phase 1 standardises REST contracts on the NestJS Swagger/OpenAPI document already produced by the backend apps, then generates TypeScript types with `openapi-typescript`. Frontends keep their existing runtime stack: REST endpoints, TanStack Query, the shared `apiFetch` helper, MobX shell state, and i18n/locale handling.

## Rationale

- Nest controllers remain the source of truth for request/response shapes and auth/error metadata.
- OpenAPI JSON is committed under `docs/openapi/` for review, audits, and external clients.
- Generated TypeScript lives in `libs/common/api-contracts` and is imported by frontend code to remove hand-written duplicate payload/envelope types.
- No new client runtime is introduced in this phase, so auth headers, response transformation, locale persistence, and query invalidation behavior stay unchanged.

## Alternatives considered

- **Shared DTO-only library:** lightweight, but it does not describe paths, auth, errors, or external API contracts.
- **Orval/TanStack generation:** useful later for generated hooks/query keys, but too large a runtime migration for phase 1.
- **openapi-fetch:** good typed REST client, but would replace `apiFetch`; keep as a possible phase 2.
- **ts-rest/Zod:** strong end-to-end typing and validation, but requires parallel contract definitions and broader controller changes.
- **tRPC:** excellent for TypeScript-only RPC, but changes the REST contract and external client story.
- **GraphQL codegen:** valuable for graph-shaped APIs, but unnecessary for current resource endpoints and would add schema/resolver complexity.

## Workflow

- Run `pnpm api:contracts` after changing controller DTOs, routes, auth decorators, or response shapes.
- Run `pnpm api:contracts:check` in CI/checks to export auth, user, and admin OpenAPI JSON into a temp directory, regenerate TS types, and compare with committed files.
- `pnpm run check` includes `api:contracts:check` before lint/typecheck/tests.

## Migration rules and pitfalls

- Keep runtime behavior in controllers unchanged; Swagger DTO classes describe existing responses only.
- Use `@ApiBearerAuth`, `@ApiProblemExceptions`, and `@ApiOkDataResponse` on practical endpoints that frontends consume.
- Prefer importing aliases from `@app/api-contracts` in frontends instead of re-declaring payload/envelope types.
- Treat generated files as read-only; fix source decorators/DTOs and regenerate.
- Be careful with optional frontend handling: generated contracts describe successful backend responses, while UI code may still receive missing data during failed/partial requests.
