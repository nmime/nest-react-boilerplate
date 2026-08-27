# @app/backend-mongodb-main-payments Instructions

Follow the root [AGENTS.md](../../../../../../AGENTS.md), [backend library rules](../../../../../../libs/backend/AGENTS.md), and [AI agent policy](../../../../../../docs/ai/agent-policy.md).

- Responsibility: payments native MongoDB collections, validators, migrations, verifier, and ordered-write repository (reference axis — shipped but not wired while the workspace axis is PostgreSQL).
- Keep the public API behind `src/index.ts`.
- Import other projects only through aliases declared in `tsconfig.base.json`.
- Do not use MongoDB transactions in this axis; preserve the documented `receipt → event → payment` crash-recovery order.
- Do not move transport, domain, and persistence concerns across their generated boundaries.
- Run the local build and test targets after changes.

Nx tags: `platform:backend`, `type:data-access`, `scope:payments`.
