# starter-app Instructions

Follow the root [AGENTS.md](../../../AGENTS.md) and [frontend app rules](../../../apps/frontend/AGENTS.md).

- Runtime: Vite/React
- Keep renderer entrypoints and routing in this application.
- Put reusable browser UI, state, and API plumbing in `libs/frontend/**`.
- Never import backend aliases from frontend source.
- Run `pnpm run frontend:fsd:check` after structural changes.
