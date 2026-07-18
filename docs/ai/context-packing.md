# AI context packing

Context packing keeps AI instructions useful by making each layer small, scoped, and easy to verify.

## Root policy budget

[AGENTS.md](../../AGENTS.md) should contain only short rules that must be loaded for nearly every repository task:

- repository safety boundaries
- branch, commit, and author policy
- stable top-level monorepo layout
- generated artifact policy
- canonical docs index and validation pointer

Keep long procedures, examples, troubleshooting, and task-specific checklists outside root `AGENTS.md`. Detailed repository policy belongs in [AI agent policy](agent-policy.md).

## Progressive disclosure

Use this order when deciding where to place guidance:

1. Root `AGENTS.md` for non-negotiable always-on policy.
2. `docs/ai/agent-policy.md` for detailed coding-agent policy.
3. `docs/ai/*.md` for agent-context architecture and retrieval rules.
4. Topic docs under `docs/**` for durable human-readable details.
5. `.agents/skills/**` for repeatable task workflows that agents should opt into.
6. Nested `AGENTS.md` only when a subtree needs different always-on rules.

## Shared context for backend cross-cutting patterns

The following backend patterns are documented in [agent-policy.md](agent-policy.md) and mapped in
[repo-map.md](repo-map.md) so agents can find them without reading every library README:

- **Request Context (CLS)**: `@app/backend-common-bootstrap` provides `requestContext` backed by
  Node.js `AsyncLocalStorage`. No `nestjs-cls` dependency. Agents should reference
  [agent-policy.md § Request Context](agent-policy.md#request-context-cls) for the canonical import
  and usage pattern.
- **Exception System (RFC 9457)**: `@app/backend-common-exception` provides the `Exception` factory
  and domain exception classes. All HTTP errors serialize to RFC 9457 Problem Details. Agents should
  reference [agent-policy.md § Exception System](agent-policy.md#exception-system-rfc-9457) for the
  canonical import, constructor shape, and anti-patterns.
- **Health checks**: `@app/backend-common-health` provides `BaseHealthController` and `HealthService`.

These sections live in `agent-policy.md` (detailed), `repo-map.md` (quick reference table), and
`agent-workflows.md` (procedural steps). Do not duplicate the full patterns into other context files.

## Nested AGENTS.md policy

Do not add extra nested `AGENTS.md` files outside the existing project-root
pattern by default. Add one only when all are true:

- the subtree has durable rules not useful elsewhere
- the rules are shorter than linking every agent to a long topic doc
- the owning subtree has enough churn that automatic loading is valuable
- the content does not duplicate the root policy

Current approved nested policy files:

- `apps/frontend/AGENTS.md` for frontend renderer and FSD rules.
- `apps/backend/AGENTS.md` for NestJS/API/health rules.
- `apps/e2e/AGENTS.md` for e2e verification rules.
- `libs/AGENTS.md` plus `libs/backend/AGENTS.md`,
  `libs/frontend/AGENTS.md`, and `libs/common/AGENTS.md` for library
  boundaries.
- `packages/tooling/AGENTS.md` for repository tooling rules.
- Leaf `AGENTS.md` files at every Nx app, library, and package project root.

Leaf app/library/package `AGENTS.md` files should stay short and link to the
nearest platform policy plus the local README.

## Tool-specific files

Tool-specific files must be adapters, not forks of policy:

- `CLAUDE.md` should point to or import `AGENTS.md`.
- `.github/copilot-instructions.md` should stay redirect-only while external AI assistants remain disallowed.
- `.cursor/rules/**` may exist only as redirect-only adapters while external AI assistants remain disallowed.
- Do not add `.devin/rules`, `.windsurf/rules`, or new tool-specific policy forks unless repository policy explicitly allows those tools.

## Quality checks

For AI guidance changes, run:

- Markdown formatting for touched files
- `pnpm run docs:check`
- `git diff --check`
- static denylist checks for stale versions, generated-path mistakes, duplicate policy, and magic completion markers

Context files should make the correct work easier. If a rule cannot be verified, enforced, or tied to repeated repository mistakes, keep it out of always-loaded context.
