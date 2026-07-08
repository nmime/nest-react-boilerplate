# @app/common-api-contracts Instructions

Follow the root [AGENTS.md](../../../../AGENTS.md) and detailed [AI agent policy](../../../../docs/ai/agent-policy.md) first.
Also follow [libs/common/AGENTS.md](../../AGENTS.md).

This is the local policy adapter for `@app/common-api-contracts` at `libs/common/api-contracts/lib`.
Project type: `library`.
Tags: `platform:shared`, `type:common`, `scope:api-contracts`, `boundary:contracts`, `framework:neutral`.

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Keep this library framework-neutral so it can be used by both backend and frontend runtimes.
- Respect the declared scope tag: `api-contracts`.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for project commands and ownership notes.
