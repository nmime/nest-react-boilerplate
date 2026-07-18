# @app/common-i18n-runtime Instructions

Follow the root [AGENTS.md](../../../../../AGENTS.md) and detailed [AI agent policy](../../../../../docs/ai/agent-policy.md) first.
Also follow [libs/common/AGENTS.md](../../../AGENTS.md).

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Keep this library framework-neutral so it can be used by both backend and frontend runtimes.
- Respect the declared scope tag: `shared`.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for the library purpose and verification commands.
