# Backend request context

## Purpose

Owns the shared `AsyncLocalStorage` request context used by bootstrap, response,
logging, and feature boundaries without creating dependency cycles.

## Commands

```bash
pnpm exec nx run @app/backend-common-request-context:build
pnpm exec nx run @app/backend-common-request-context:test
```
