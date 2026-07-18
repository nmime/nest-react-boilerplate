# fullstack-e2e Instructions

Follow the root [AGENTS.md](../../../AGENTS.md) and detailed [AI agent policy](../../../docs/ai/agent-policy.md) first.
Also follow [apps/e2e/AGENTS.md](../AGENTS.md).

## Local Rules

- Keep app entrypoints, renderer/service composition, and app-local configuration in this project.
- Move reusable behavior into the owning `libs/**` project instead of sharing through another app.
- Keep this project focused on cross-app smoke and full-stack verification, not reusable product logic.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for project commands and ownership notes.
