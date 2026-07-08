# site-app Instructions

Follow [frontend app rules](../AGENTS.md) and the root
[AGENTS.md](../../../AGENTS.md).

This app owns the Vike SSR site shell and server entrypoint. Keep renderer-neutral
logic in shared frontend libraries, avoid backend-only imports, and run the Vike
smoke/typecheck targets after SSR wiring changes. See [README.md](README.md) for
commands and ownership.
