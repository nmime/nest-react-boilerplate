---
name: change-api-contract
description: Propagate a public API change through OpenAPI, shared contracts, generated clients, and consumers. Use when changing controllers, DTOs, response schemas, problem details, client generation, or API compatibility.
---

# Change an API contract

## Read first

- Read `../../../docs/api-contracts.md`, `../../../docs/api-lifecycle-policy.md`,
  `../../../docs/command-matrix.md`, the owning controller/DTO,
  generated-artifact policy, and all known consumers.
- Determine whether the change is additive, behavior-changing, or breaking before editing.

## Workflow

1. Change the source controller, DTO, validation, and documented problem responses first. Never start by editing generated output.
2. Build the owning API so metadata and schemas reflect compiled source.
3. Run `pnpm run api:contracts`, inspect the OpenAPI diff, then run
   `pnpm run api:clients` and any toast/error mapping generation required by the command matrix.
4. Update every repository consumer or provide an intentional compatibility path owned by the API. Do not hide a breaking change with untyped casts.
5. Test request validation, response shape, documented errors, auth requirements, and at least one generated-client consumer path.
6. Keep generated files deterministic and source-attributable; unexpected unrelated churn is a failure to investigate.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Verification

Run `pnpm run api:contracts:check`, `pnpm run api:clients:check`, owning API tests/build, affected frontend or service tests/builds, and `git diff --check`. State compatibility impact in the handoff.
