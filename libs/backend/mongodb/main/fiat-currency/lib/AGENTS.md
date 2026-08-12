# @app/backend-mongodb-main-fiat-currency Instructions

Follow the root [AGENTS.md](../../../../../../AGENTS.md) and detailed [AI agent policy](../../../../../../docs/ai/agent-policy.md) first.
Also follow [libs/backend/AGENTS.md](../../../../AGENTS.md).

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep Mongo documents private and return the neutral records the shared port declares, so nothing above can tell which axis answered.
- Collection validators and indexes are migration-owned; keep them aligned with the queries the repository actually issues.
- A rate write must stay ordered history-first, so an interrupted pair leaves a stale headline rate rather than a rate with no observation behind it.
- Respect the scope and boundary tags declared in `project.json`; do not copy their values into local instructions.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for the library purpose and verification commands.
