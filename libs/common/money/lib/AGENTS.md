# @app/common-money Instructions

Follow the root [AGENTS.md](../../../../AGENTS.md) and detailed [AI agent policy](../../../../docs/ai/agent-policy.md) first.
Also follow [libs/common/AGENTS.md](../../AGENTS.md).

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Keep this library framework-neutral so it can be used by both backend and frontend runtimes.
- Never route a monetary value through a binary float; amounts are whole minor units and ratios are exact.
- Every operation that can lose a minor unit must either name its rounding mode or preserve the total.
- Respect the scope and boundary tags declared in `project.json`; do not copy their values into local instructions.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for the library purpose and verification commands.
