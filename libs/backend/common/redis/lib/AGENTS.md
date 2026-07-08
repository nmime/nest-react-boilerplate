# @app/backend-common-redis Instructions

Follow the root [AGENTS.md](../../../../../AGENTS.md) and detailed [AI agent policy](../../../../../docs/ai/agent-policy.md) first.
Also follow [libs/backend/AGENTS.md](../../../AGENTS.md).

This is the local policy adapter for `@app/backend-common-redis` at `libs/backend/common/redis/lib`.
Project type: `library`.
Tags: `platform:backend`, `type:common`, `scope:shared`, `boundary:infrastructure-adapter`.

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Respect the declared scope tag: `shared`.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for project commands and ownership notes.
