# @app/backend-common-exception Instructions

Follow the root [AGENTS.md](../../../../../AGENTS.md) and detailed [AI agent policy](../../../../../docs/ai/agent-policy.md) first.
Also follow [libs/backend/AGENTS.md](../../../AGENTS.md).

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Respect the scope and boundary tags declared in `project.json`; do not copy their values into local instructions.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for the library purpose and verification commands.
