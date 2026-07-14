# Tooling Package Instructions

Follow the root [AGENTS.md](../../AGENTS.md) and detailed
[AI agent policy](../../docs/ai/agent-policy.md) first. This file adds rules for
`packages/tooling`.

## Runtime stack

- Node.js `>=24 <25`, pnpm `11.11.0`, TypeScript
- CLS request context: `requestContext.getRequestId()` (no setup needed in tooling)
- Exception system: RFC 9457 via `@app/backend-common-exception`

## Tooling Boundaries

- Implement repository automation under `packages/tooling/src/commands/**` and
  register CLI entrypoints through `packages/tooling/src/cli.ts`.
- Expose public developer commands through root `package.json` scripts and
  document them in [Command matrix](../../docs/command-matrix.md) or
  [packages/tooling/README.md](README.md).
- Keep static checks safe: do not run Docker, deploy commands, destructive
  database operations, or external network-dependent actions from
  `tooling static-check`.
- Add focused tests under `packages/tooling/src/**/*.test.ts` for new command
  behavior and run `pnpm run tooling:static-check` after tooling changes.
