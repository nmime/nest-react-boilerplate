# @app/backend-feature-user-shared Instructions

Follow the root [AGENTS.md](../../../../../../AGENTS.md) and detailed [AI agent policy](../../../../../../docs/ai/agent-policy.md) first.
Also follow [libs/backend/AGENTS.md](../../../../AGENTS.md).

This is the local policy adapter for `@app/backend-feature-user-shared` at `libs/backend/feature/user/shared/lib`.
Project type: `library`.
Tags: `platform:backend`, `type:feature-shared`, `scope:user`.

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Keep this as shared feature contracts/helpers only; avoid runtime app composition here.
- Respect the declared scope tag: `user`.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for project commands and ownership notes.
