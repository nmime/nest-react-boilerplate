# Common Library Instructions

Follow [library instructions](../AGENTS.md), the root [AGENTS.md](../../AGENTS.md),
and [AI agent policy](../../docs/ai/agent-policy.md).

## Common Library Rules

- Keep common libraries framework-neutral unless the project tags explicitly
  allow a runtime-specific surface.
- Do not import backend-only or frontend-only libraries from shared common
  projects.
- Keep generated contract review types under the existing generated path and do
  not hand-edit them.
- Shared constants, types, i18n keys, authz primitives, feature flag contracts,
  and design tokens belong here when they are truly cross-runtime.

## Agent Workflows

- Select frontend or backend planning/development skills from the actual
  consumers; do not make a common library runtime-specific for convenience.
- Use `$validate-frontend-quality` and `$validate-backend-quality` when a shared
  contract affects both runtime classes, then finish with `$validate-change`.
- Chain `$change-api-contract`, `$change-auth-access`, `$change-i18n`, or
  `$extend-notifications` when the common contract belongs to that boundary.
