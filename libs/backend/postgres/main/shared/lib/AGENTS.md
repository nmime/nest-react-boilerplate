# @app/backend-postgres-main Instructions

Follow the root [AGENTS.md](../../../../../../AGENTS.md) and detailed [AI agent policy](../../../../../../docs/ai/agent-policy.md) first.
Also follow [libs/backend/AGENTS.md](../../../../AGENTS.md).

This is the local policy adapter for `@app/backend-postgres-main` at `libs/backend/postgres/main/shared/lib`.
Project type: `library`.
Tags: `platform:backend`, `type:data-access`, `scope:postgres`.

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep persistence concerns here; expose behavior through feature/application boundaries instead of app-local database code.
- Respect the declared scope tag: `postgres`.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for project commands and ownership notes.
