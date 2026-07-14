# Architecture Decision: Use Nx over Turborepo

| Field    | Value                               |
| -------- | ----------------------------------- |
| Status   | Accepted                            |
| Date     | 2025-01-15                          |
| Authors  | @nmime                              |
| Decision | Use Nx as the monorepo build system |

## Context

We evaluated monorepo build orchestration tools to manage our NestJS backend and React frontend monorepo. The primary candidates were **Nx** and **Turborepo**.

## Decision

We chose **Nx** as our build system.

## Rationale

1. **Project Graph**: Nx builds an accurate, dependency-aware project graph from `project.json` files and import analysis. This enables precise affected calculations, impact analysis, and visual project exploration via `nx graph`. Turborepo relies on `turbo.json` glob-based task pipelines, which are less precise for monorepo boundary enforcement.

2. **Code Generation**: Nx has a rich plugin ecosystem with first-class code generators (`nx g @nx/react:component`, `nx g @nx/nest:service`, etc.) that scaffold consistent, convention-aligned code. Turborepo has no built-in code generation.

3. **Caching**: Both tools offer remote caching, but Nx's daemon (`NX_DAEMON`) keeps the project graph in memory across runs, providing faster incremental builds even without remote cache. Nx's cache is also aware of implicit dependencies (e.g., shared libs, configs) automatically.

4. **Strict Boundaries**: Nx's `enforce-module-boundaries` ESLint rule prevents circular dependencies and unauthorized cross-project imports at lint time. Turborepo does not enforce module boundaries.

5. **Ecosystem Integration**: Nx plugins exist for NestJS, React, Vite, Cypress, Playwright, and more, providing opinionated defaults that reduce configuration overhead.

## Turborepo Considerations

Turborepo is faster in raw task scheduling (Go-based) and simpler to configure for flat task pipelines. However, it lacks:

- Code generation
- Strict module boundary enforcement
- An accurate dependency graph for large monorepos
- Integrated task distribution awareness

These gaps outweigh its raw speed advantage for our project size and structure.

## Consequences

- **Positive**: Consistent codegen, strict boundaries, accurate affected analysis, fewer manual pipeline definitions.
- **Negative**: Slightly slower raw task scheduling vs. Turborepo, heavier initial configuration, Nx daemon resource usage (mitigated by `NX_DAEMON=false` in CI).
- **Migration**: Existing Turborepo configs can be incrementally migrated; Nx can run alongside during transition.

## References

- [Nx Documentation](https://nx.dev/)
- [Turborepo Documentation](https://turbo.build/)
- [Nx vs Turborepo comparison](https://nx.dev/learn/why-nx)
