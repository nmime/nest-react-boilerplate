# @app/frontend-api-support

## Purpose

Owns browser-safe API requests, auth and resilience middleware, environment
resolution, error normalization, toast events, and the approved raw-fetch boundary.

API requests carry the current `Accept-Language`. Problem responses retain the
canonical RFC 9457 identity in `type`, expose a short stable `code` for frontend
branching, and keep translated user-facing copy in `title`, `detail`, and
validation messages. Toast rules can match either `type` or `code`; never match
localized text. Compose defaults with `createDefaultApiToastRules()` at request
time so a live locale change also updates fallback toast copy.

Generated endpoint, method, status, problem-code, `ERR`, and `NET` rules run
before broad runtime fallbacks. The API client provider loads tenant overrides
from the authenticated auth API and passes them to
`configureProblemPresentationOverrides`; invalid or unavailable overrides fail
closed to the checked-in generated defaults.

## Commands

```bash
pnpm exec nx run @app/frontend-api-support:build
pnpm exec nx run @app/frontend-api-support:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../AGENTS.md)
- [Repository architecture](../../../../docs/architecture.md)
- [Command matrix](../../../../docs/command-matrix.md)
- [Testing](../../../../docs/testing.md)
- [Frontend FSD](../../../../docs/frontend-fsd.md)
