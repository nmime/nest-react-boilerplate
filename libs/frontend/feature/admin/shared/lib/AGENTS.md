# @app/frontend-feature-admin-shared Instructions

Follow the root [AGENTS.md](../../../../../../AGENTS.md) and detailed [AI agent policy](../../../../../../docs/ai/agent-policy.md) first.
Also follow [libs/frontend/AGENTS.md](../../../../AGENTS.md).

This is the local policy adapter for `@app/frontend-feature-admin-shared` at `libs/frontend/feature/admin/shared/lib`.
Project type: `library`.
Tags: `platform:frontend`, `type:feature-shared`, `scope:admin`, `fsd:layer:shared`.

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import backend libraries from frontend code. Respect FSD tags and use frontend platform dependencies from `libs/frontend/package.json`.
- Keep this as shared feature contracts/helpers only; avoid runtime app composition here.
- Respect the declared scope tag: `admin`.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for project commands and ownership notes.
