# Backend request context

Owns the shared `AsyncLocalStorage` request context used by bootstrap, response, logging, and feature boundaries without creating dependency cycles.

```bash
pnpm exec nx run @app/backend-common-request-context:build
pnpm exec nx run @app/backend-common-request-context:test
```
