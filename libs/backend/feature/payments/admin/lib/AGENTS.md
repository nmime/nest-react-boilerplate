# @app/backend-feature-payments-admin Instructions

Follow the root [AGENTS.md](../../../../../../AGENTS.md), [backend library rules](../../../../../../libs/backend/AGENTS.md), and [AI agent policy](../../../../../../docs/ai/agent-policy.md).

- Responsibility: Payments admin surface — provider-registry management and payment overrides, mounted on admin-app-api only.
- Keep the public API behind `src/index.ts`.
- Import other projects only through aliases declared in `tsconfig.base.json`.
- Do not move transport, domain, and persistence concerns across their generated boundaries.
- Run the local build and test targets after changes.

Nx tags: `platform:backend`, `type:feature-admin`, `scope:payments`.
