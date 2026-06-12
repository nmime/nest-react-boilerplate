# API lifecycle policy

The boilerplate treats APIs as product contracts. This policy defines how routes move from experimental to stable and how consumers are protected.

## Lifecycle states

| State        | Use for                                 | Requirements                                                                                                                               |
| ------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Experimental | Internal trials or feature-flagged work | Route hidden behind a feature flag, no compatibility promise, contract may change in the same minor release.                               |
| Beta         | Product-visible but still evolving      | OpenAPI documented, generated client updated, consumer contract added for expected flows, breaking changes announced in PR notes.          |
| Stable       | Default for shipped product APIs        | Backward compatible by default, deprecations last at least one minor release, all changes covered by OpenAPI and consumer-contract checks. |
| Deprecated   | Supported but scheduled for removal     | Response/header or docs note includes replacement and removal target.                                                                      |
| Removed      | No longer served                        | Contract/client removed in the same PR as route removal and changelog entry.                                                               |

## Versioning and compatibility

- Prefer additive changes: new optional fields, new endpoints, or new enum values documented as forward-compatible.
- Do not remove fields, narrow enum values, change status codes, or change error shapes on stable APIs without a deprecation window.
- Problem responses must follow the shared exception/Swagger helpers so frontend clients can handle errors consistently.
- Auth, tenancy, rate-limit, and RBAC behavior are part of the API contract and must be tested.

## Required PR checklist for API changes

- [ ] Route is mounted in the owning API module.
- [ ] DTOs and Swagger decorators describe request/response shape.
- [ ] `pnpm api:openapi` and `pnpm api:contracts` were run when the OpenAPI contract changed.
- [ ] `pnpm api:clients` was run when frontend clients need updates.
- [ ] Consumer contract or e2e coverage exists for product-critical behavior.
- [ ] Lifecycle state and any deprecation/removal date are documented in the PR.

## Contract artifact policy

Generated OpenAPI JSON, shared TypeScript contract types, generated frontend clients, and consumer Pact artifacts are versioned with the source API change in the same PR. Problem responses must follow RFC 9457 and the shared singular `@app/common/exception`/Swagger helpers so frontend clients can handle errors consistently.
