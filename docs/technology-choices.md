# Technology choices

This boilerplate favors widely adopted libraries, explicit boundaries, and fast CI feedback.

## Nx and pnpm

Nx provides project graph awareness, cached targets, module-boundary enforcement, and consistent commands across apps and libraries. pnpm 10.32.1 is used as the package manager for deterministic workspace installs.

Common commands:

```bash
pnpm exec nx run-many -t lint --all
pnpm exec nx run-many -t typecheck --all
pnpm exec nx run-many -t test --all
pnpm exec nx run-many -t build --all
```

## React, Vite, and Vitest

The frontend apps use React with Vite for fast local development and production builds. Vitest powers component and smoke tests. Static e2e checks avoid browser installation cost while still verifying production build artifacts for all frontend apps.

## NestJS 11

Backend APIs use NestJS 11 and stay deployable as independent app shells. Shared bootstrap, validation, and response behavior lives in backend libraries instead of being duplicated across apps.

## Strict validation and security defaults

The shared bootstrap and validation libraries make secure defaults the easy path:

- Helmet is enabled by default.
- CORS is enabled in a configurable way.
- Validation transforms payloads, strips unknown properties, and rejects non-whitelisted input.
- No library requires runtime secrets by default.

## neverthrow

`neverthrow` is used for explicit success/failure boundaries. The response library maps `Result` values to stable API responses, and the OAuth shell uses `ResultAsync` for asynchronous provider flows.

## openid-client

`openid-client` is the OAuth/OIDC foundation. The included auth library is disabled by default and has tests that avoid live provider calls, making it safe for CI and easy to configure later.

## No external service requirement

The current verification suite does not require a database, cache, browser, or live OAuth provider. That keeps the template lightweight and allows future product teams to add persistence or provider integrations deliberately.
