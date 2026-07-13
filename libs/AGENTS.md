# Library Instructions

Follow the root [AGENTS.md](../AGENTS.md) and detailed
[AI agent policy](../docs/ai/agent-policy.md) first. This file applies to `libs/**`.

## Library Rules

- Library project roots live under `libs/**/lib`.
- Keep reusable code in libraries and app/runtime composition in `apps/**`.
- Respect Nx tags, public path aliases, and platform boundaries.
- Do not add per-library `package.json` files; platform manifests live at
  `libs/backend/package.json` and `libs/frontend/package.json`.
- Keep generated artifacts read-only unless the task explicitly includes
  regeneration.
