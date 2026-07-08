# @app/backend-common-component-test Instructions

Follow the root [AGENTS.md](../../../../../AGENTS.md) and detailed [AI agent policy](../../../../../docs/ai/agent-policy.md) first.
Also follow [libs/backend/AGENTS.md](../../../AGENTS.md).

This is the local policy adapter for `@app/backend-common-component-test` at `libs/backend/common/component-test/lib`.
Project type: `library`.
Tags: `platform:backend`, `type:test-util`, `scope:shared`, `boundary:test-util`.

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in `libs/backend/package.json`.
- Use this only from tests or test support targets. Do not import test utilities into production runtime code.
- Respect the declared scope tag: `shared`.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for project commands and ownership notes.
