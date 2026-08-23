# @app/backend-mongodb-main-payments Instructions

Follow the root [AGENTS.md](../../../../../../AGENTS.md), [backend library rules](../../../../../../libs/backend/AGENTS.md), and [AI agent policy](../../../../../../docs/ai/agent-policy.md).

- Responsibility: Payments native MongoDB collection, transactional repository, and idempotent indexes (reference axis — shipped but not wired while the workspace axis is postgres).
- Keep the public API behind `src/index.ts`.
- Import other projects only through aliases declared in `tsconfig.base.json`.
- Do not move transport, domain, and persistence concerns across their generated boundaries.
- Run the local build and test targets after changes.

Nx tags: `platform:backend`, `type:data-access`, `scope:payments`.
