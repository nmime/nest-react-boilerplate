# @app/backend-mongodb-main Instructions

Follow the root [AGENTS.md](../../../../../../AGENTS.md) and detailed [AI agent policy](../../../../../../docs/ai/agent-policy.md) first.
Also follow [libs/backend/AGENTS.md](../../../../AGENTS.md).

## Local Rules

- Keep the public API behind `src/index.ts`.
- Keep the runtime transaction-capable: never weaken replica-set/topology validation or permit standalone MongoDB.
- Preserve snapshot read concern, majority write concern, and bounded retry behavior in transaction helpers.
- Do not expose connection strings, credentials, or raw driver errors through health details.
- Shared backend dependencies belong in `libs/backend/package.json`.

See [README.md](./README.md) for the library purpose and verification commands.
