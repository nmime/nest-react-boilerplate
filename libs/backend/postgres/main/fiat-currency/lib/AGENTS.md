# @app/backend-postgres-main-fiat-currency Instructions

Follow the root [AGENTS.md](../../../../../../AGENTS.md) and detailed [AI agent policy](../../../../../../docs/ai/agent-policy.md) first.
Also follow [libs/backend/AGENTS.md](../../../../AGENTS.md).

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep entities private and return the neutral records the shared port declares, so nothing above can tell which axis answered.
- Schema changes belong in a migration, not in entity metadata alone, and every constraint name must stay inside the 63-byte Postgres identifier limit.
- Keep rate history append-only: a repeated observation is an upsert on `(code, as_of, source)`, never an overwrite of what was recorded.
- Respect the scope and boundary tags declared in `project.json`; do not copy their values into local instructions.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for the library purpose and verification commands.
