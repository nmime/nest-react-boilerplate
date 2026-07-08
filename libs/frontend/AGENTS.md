# Frontend Library Instructions

Follow [library instructions](../AGENTS.md), the root [AGENTS.md](../../AGENTS.md), and [AI agent policy](../../docs/ai/agent-policy.md).

## Frontend Library Rules

- Do not import backend libraries from frontend libraries.
- Respect FSD layer/slice tags and run `pnpm run frontend:fsd:check` after frontend structure/import changes.
- Put React DOM UI in `ui-web`, native/Tamagui UI in `ui-native`, runtime helpers in `runtime`, and API request/client code in `api-support` or `api-client`.
- Put shared frontend runtime dependencies in `libs/frontend/package.json`, not individual library package manifests.
