# Technology choices

## Nx and pnpm

Nx provides project graph awareness, cached targets, module-boundary enforcement, and consistent commands across apps and libraries. pnpm 10.32.1 is pinned for deterministic workspace installs on Node.js 22.

## React, Vite, and Vitest

The frontend apps use React with Vite for local development and production static builds. Vitest powers unit and component tests. Coverage uses `@vitest/coverage-v8` with 100% thresholds for the repository's own testable source.

## NestJS 11

Backend APIs use NestJS 11 and remain deployable as independent app shells. Shared bootstrap, validation, and response behavior lives in backend libraries instead of being duplicated across apps.

## Security defaults

Backend startup applies Helmet, a strict validation pipe, and CORS behavior that is convenient in development but does not reflect arbitrary origins in production. Allowed production origins should be supplied with `CORS_ORIGINS` or `CORS_ORIGIN`.

## Dependency compatibility

Patch updates within the current Nest major are preferred. TypeScript 6, ESLint 10, and Node type definitions for Node 25 are deferred until the Nx and Node 22 toolchain officially supports them in this workspace.
