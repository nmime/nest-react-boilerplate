## Why

The existing tenant-scoped Problem Presentations page only edits generated toast/silent overrides. Administrators need a native, product-neutral studio that safely ingests manual OpenAPI sources, tracks response changes, manages rich localized presentation rules, and exports the repository's actual runtime contract without deploying a second admin application.

## What Changes

- Extend presentation overrides additively with toast/modal/custom/silent behavior, severity/support metadata, safe custom/Figma notes, EN/RU/ZH text arrays, comments, revision, actor, and timestamps.
- Add tenant-scoped OpenAPI source and response inventory persistence for PostgreSQL and MongoDB.
- Add deterministic, injectable, SSRF-safe manual synchronization with bounded parsing, refs/unions/cycles, enum expansion, synthetic ERR/NET variants, idempotent change tracking, and soft deletion.
- Add admin API endpoints for dashboard, sources, inventory, sync, row/bulk update/reset, dismiss, export, and history under the existing settings permission pair.
- Evolve `/admin/settings/errors` into API Response Studio using the current generated client, FSD route, shared UI, and EN/RU catalogs.
- Preserve existing override and runtime behavior while exposing modal/custom presentations only to capable consumers and never degrading them into success toasts.

## Capabilities

### New Capabilities

- `api-response-studio`: tenant-scoped source ingestion, response configuration, safe runtime presentation, export, and admin experience.

### Modified Capabilities

- `authentication-access`: tenant isolation, persistence, audit, and RBAC for the new admin settings resource.
- `api-contracts`: additive admin/runtime DTOs and generated clients.
- `frontend-experience`: the existing settings route gains the complete Response Studio journey.

## Impact

- Common problem presentation contracts and frontend API runtime.
- Admin/auth feature libraries and generated OpenAPI clients.
- PostgreSQL/MongoDB auth-owned settings persistence and additive migrations.
- Admin SPA page, tests, responsive styles, route copy, and i18n catalogs.
- API/OpenAPI/client/toast/endpoint/i18n/closure generated artifacts.
