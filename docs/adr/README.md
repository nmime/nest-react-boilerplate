# Architecture Decision Records

ADRs capture durable architectural decisions that should outlive a single pull
request. Use them for decisions that affect public APIs, repo layout, deployment
topology, dependency strategy, data ownership, or long-term migration paths.

## Naming

Use a four-digit prefix and short slug:

```text
0001-use-nx-project-graph.md
```

## Status Values

- `Proposed` - ready for review, not yet accepted.
- `Accepted` - current policy.
- `Superseded` - replaced by a newer ADR.
- `Rejected` - considered and intentionally not adopted.

## Template

Copy [0000-template.md](0000-template.md) for new ADRs.

## ADR Index

| #                                                              | Title                                                                      | Status   | Date       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- | -------- | ---------- |
| [0001](0001-use-nx-over-turborepo.md)                          | Use Nx over Turborepo                                                      | Accepted | 2025-01-15 |
| [0002](0002-use-fastify-over-express.md)                       | Use Fastify over Express                                                   | Accepted | 2025-01-15 |
| [0003](0003-explicit-selection-model-no-default-deployable.md) | Explicit selection model with no default deployable                        | Accepted | 2026-08-04 |
| [0004](0004-dual-durable-provider-strategy.md)                 | Dual durable-provider strategy (PostgreSQL or MongoDB, mutually exclusive) | Accepted | 2026-08-04 |
| [0005](0005-better-auth-session-ownership.md)                  | Better Auth adoption for session ownership                                 | Accepted | 2026-08-04 |
| [0006](0006-contract-first-api-pipeline.md)                    | Contract-first API pipeline with generated clients and RFC 9457 errors     | Accepted | 2026-08-04 |
| [0007](0007-bun-secondary-runtime.md)                          | Bun 1.3.14 as a secondary runtime contract, Node as canonical              | Accepted | 2026-08-04 |
| [0008](0008-openspec-assurance-graph.md)                       | OpenSpec/Cucumber specification-assurance graph                            | Accepted | 2026-08-04 |
