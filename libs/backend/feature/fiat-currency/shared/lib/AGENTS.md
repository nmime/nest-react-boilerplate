# @app/backend-feature-fiat-currency-shared Instructions

Follow the root [AGENTS.md](../../../../../../AGENTS.md) and detailed [AI agent policy](../../../../../../docs/ai/agent-policy.md) first.
Also follow [libs/backend/AGENTS.md](../../../../AGENTS.md).

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep this library storage-neutral: no ORM, no driver, no Nest module — both persistence axes depend on it, not the other way round.
- Read a rate as an exact ratio and never as a float, and refuse a cross rate that no longer fits in an exact integer rather than approximating it.
- Respect the scope and boundary tags declared in `project.json`; do not copy their values into local instructions.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for the library purpose and verification commands.
