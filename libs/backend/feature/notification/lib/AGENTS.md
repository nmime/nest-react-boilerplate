# @app/backend-feature-notification Instructions

Follow the root [AGENTS.md](../../../../../AGENTS.md) and detailed [AI agent policy](../../../../../docs/ai/agent-policy.md) first.
Also follow [libs/backend/AGENTS.md](../../../AGENTS.md).

This is the local policy adapter for `@app/backend-feature-notification` at `libs/backend/feature/notification/lib`.
Project type: `library`.
Tags: `platform:backend`, `type:feature-main`, `scope:notification`.

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Respect the declared scope tag: `notification`.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for project commands and ownership notes.
