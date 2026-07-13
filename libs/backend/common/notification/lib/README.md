# @app/common-notification

Path: `libs/backend/common/notification/lib`
Nx project: `@app/common-notification`
Project type: `library`
Tags: `platform:backend`, `type:shared`, `scope:notification`

## Purpose

Notification shared library: abstract service interface, DTOs, types, and sync implementation for creating single/batch template-based notifications.

## Ownership

- Keep the public API behind this library boundary and prefer exports through `src/index.ts` when present.
- Do not import frontend libraries from backend code.
- Respect the declared scope tag: `notification`.

## Commands

```bash
pnpm exec nx run @app/common-notification:test
pnpm exec nx run @app/common-notification:build
```
