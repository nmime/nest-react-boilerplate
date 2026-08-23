# @app/backend-feature-payments-admin

## Purpose

Payments admin surface — provider-registry management and payment overrides, mounted on
admin-app-api only (admin routes never mount on the user/auth/notification surfaces).

## Verification

```bash
pnpm exec nx run @app/backend-feature-payments-admin:build
pnpm exec nx run @app/backend-feature-payments-admin:test
```
