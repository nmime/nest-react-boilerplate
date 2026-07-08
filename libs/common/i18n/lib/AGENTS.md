# @app/common-i18n Instructions

Follow the root [AGENTS.md](../../../../AGENTS.md) and detailed [AI agent policy](../../../../docs/ai/agent-policy.md) first.
Also follow [libs/common/AGENTS.md](../../AGENTS.md).

This is the local policy adapter for `@app/common-i18n` at `libs/common/i18n/lib`.
Project type: `library`.
Tags: `platform:shared`, `type:common`, `scope:shared`, `boundary:i18n`, `framework:neutral`.

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Keep this library framework-neutral so it can be used by both backend and frontend runtimes.
- Respect the declared scope tag: `shared`.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for project commands and ownership notes.
