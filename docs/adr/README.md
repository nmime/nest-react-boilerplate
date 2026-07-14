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

| #                                        | Title                    | Status   | Date       |
| ---------------------------------------- | ------------------------ | -------- | ---------- |
| [0001](0001-use-nx-over-turborepo.md)    | Use Nx over Turborepo    | Accepted | 2025-01-15 |
| [0002](0002-use-fastify-over-express.md) | Use Fastify over Express | Accepted | 2025-01-15 |
