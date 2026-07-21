# notification-scheduler Instructions

Follow the root [AGENTS.md](../../../../AGENTS.md), the [backend app rules](../../../../apps/backend/AGENTS.md), and the [AI agent policy](../../../../docs/ai/agent-policy.md).

- Read the renderer, identity, tags, and targets from `project.json`; do not copy those values into local instructions.
- Keep transport and process bootstrap code in this deployable application.
- Put reusable domain logic in `libs/backend/**` and cross-runtime contracts in `libs/common/**`.
- Import libraries through public aliases from `tsconfig.base.json`; do not reach into another project by relative path.
- Preserve the standard health endpoints and private-network guard for HTTP APIs.
