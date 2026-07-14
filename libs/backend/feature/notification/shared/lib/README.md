# @app/backend-feature-notification-shared

Path: `libs/backend/feature/notification/shared/lib`
Nx project: `@app/backend-feature-notification-shared`
Project type: `library`
Tags: `platform:backend`, `type:feature-shared`, `scope:notification`

## Purpose

Notification shared library: abstract service interface, DTOs, types, and sync implementation for creating single/batch template-based notifications.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code.
- Respect the declared scope tag: `notification`.

## Commands

```bash
pnpm exec nx run @app/backend-feature-notification-shared:test
pnpm exec nx run @app/backend-feature-notification-shared:build
```
