# ADR 0006: Contract-first API pipeline with generated clients and RFC 9457 errors

- Status: Accepted
- Date: 2026-08-04
- Owners: @nmime

## Context

Three backend APIs and several frontends must stay shape-compatible without
runtime surprises. Hand-written API client code drifts from controllers, and
ad-hoc error shapes make frontend error handling inconsistent across apps.

## Decision

Controllers and DTOs own API truth. OpenAPI contracts are exported from the
apps (`pnpm nrb api:openapi`), typed clients are generated from them
(`pnpm nrb api:clients`), and both have check commands (`api:clients:check`,
`api:contracts:check`) that fail CI on drift. Error responses follow RFC 9457
Problem Details (`application/problem+json`) through the shared bootstrap
library, with validation problems flattened deterministically.

## Consequences

- Generated outputs are committed so drift is visible in review, and
  `api:contracts:check` / `api:clients:check` gate merges.
- Frontends consume `@app/frontend/api-client` hooks instead of ad-hoc fetch
  wrappers; toast rules are generated per app from the contracts
  (`api:toast-config:generate/check`).
- OpenAPI linting (`api:openapi-lint`) and fuzz cases (`api:openapi-fuzz`)
  belong to the QA lane.

## Alternatives Considered

- Consumer-first clients (write the client, derive the contract): rejected
  because the backend owns behavior and must remain the source of truth.
- Unchecked generated clients: rejected because silent drift is the failure
  mode the checks exist to catch.

## Validation

`pnpm run api:contracts:check`, `pnpm run api:clients:check`, and
`pnpm run api:openapi:lint` in the fast PR gate (`docs/testing.md`), plus the
contract documentation in `docs/api-contracts.md` and `docs/api-client.md`.
