# Frontend Library Instructions

Follow [library instructions](../AGENTS.md), the root [AGENTS.md](../../AGENTS.md),
and [AI agent policy](../../docs/ai/agent-policy.md).

## Frontend Library Rules

- Do not import backend libraries from frontend libraries.
- Respect FSD layer/slice tags and run `pnpm run frontend:fsd:check` after
  frontend structure/import changes.
- Put React DOM UI in `ui-web`, native/Tamagui UI in `ui-native`, runtime
  helpers in `runtime`, and API request/client code in `api-support` or
  `api-client`.
- Keep all frontend external dependency specifiers in
  `libs/frontend/package.json`. Application identity and targets stay in Nx
  `project.json`; source imports determine each deployable's exact selected
  closure. A dependency-only app manifest is permitted only when its renderer
  requires a nearest-package boundary. App-only integrations, such as Telegram
  Mini Apps, stay out of shared library source even though the platform manifest
  owns their package.
- Use `$plan-frontend-change` for cross-library ownership decisions,
  `$design-frontend-experience` for design-system changes, and
  `$validate-frontend-quality` before handing off shared frontend changes.
