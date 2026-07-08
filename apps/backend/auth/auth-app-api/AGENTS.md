# auth-app-api Instructions

Follow [backend app rules](../../AGENTS.md) and the root
[AGENTS.md](../../../../AGENTS.md).

This service owns only auth API composition and app-local health/runtime wiring.
Keep auth feature logic in `libs/backend/feature/auth/**` and regenerate OpenAPI
contracts from source when API shape changes. See [README.md](README.md) for
commands and ownership.
