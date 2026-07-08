# @app/frontend-ui-web Instructions

Follow the root [AGENTS.md](../../../../AGENTS.md) and detailed [AI agent policy](../../../../docs/ai/agent-policy.md) first.
Also follow [libs/frontend/AGENTS.md](../../AGENTS.md).

This is the local policy adapter for `@app/frontend-ui-web` at `libs/frontend/ui-web/lib`.
Project type: `library`.
Tags: `platform:frontend`, `type:ui`, `scope:shared`, `fsd:layer:shared`.

## Local Rules

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import backend libraries from frontend code. Respect FSD tags and use frontend platform dependencies from `libs/frontend/package.json`.
- Keep UI primitives/components renderer-appropriate and covered by the relevant build/test/Storybook checks.
- Respect the declared scope tag: `shared`.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for project commands and ownership notes.
