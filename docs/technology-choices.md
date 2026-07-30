# Technology choices

## Nx and pnpm

Nx 23 provides project graph awareness, cached targets, module-boundary enforcement, and consistent commands across apps and libraries. pnpm 11.15.1 is pinned for deterministic workspace installs on the Node.js `>=24 <25` engine range.

## React, Vite, and Vitest

The React SPAs use Vite 8; the other frontend renderers are Astro, Vike, and
Expo. Vitest 4 powers unit and component tests. Coverage uses
`@vitest/coverage-v8`: new projects default to 100%, while documented legacy
negative thresholds are maximum uncovered-item budgets and may only move toward
zero.

## NestJS 11

Backend APIs use NestJS 11 on Fastify 5 and remain deployable as independent app shells. Shared bootstrap, validation, and response behavior live in backend libraries instead of being duplicated across apps.

## Security defaults

Backend startup applies Helmet, a strict validation pipe, and CORS behavior that is convenient in development but does not reflect arbitrary origins in production. Allowed production origins should be supplied with `CORS_ORIGINS` or `CORS_ORIGIN`.

## Dependency compatibility

Patch updates within the current Nest major are preferred. TypeScript 6 and ESLint 10 are the active compiler/linter baselines. The workspace targets Node.js `>=24 <25` and matches its Node type definitions to that runtime major.
