## Context

Problem presentations already live in auth-owned selectable persistence and are edited by the admin feature. This change expands that stable boundary rather than creating another deployable. The attachment contributes parser/UX semantics only.

## Goals / Non-Goals

Goals: additive compatibility, provider-neutral ports, SSRF-safe manual ingestion, bounded deterministic parsing, transactional audit/outbox, additive generated contracts, and a complete native admin page.

Non-goals: copying Strapi/React Admin/MUI/auth/deployment, enabling scheduling, adding product permissions, supporting external `$ref` fetching, or claiming a live provider canary.

## Decisions

- Keep neutral studio ports/types in `@app/backend-feature-auth-shared`, because the existing selectable auth persistence owns tenant settings and both provider modules already supply the presentation port.
- Keep parser, validation, fetch policy, use cases, and HTTP adapters in `@app/backend-feature-admin-main`; persistence adapters remain in the two auth provider libraries.
- Store source registry, response inventory/configuration, and change history in additive tables/collections. Existing overrides are widened in place with defaults so old rows remain valid.
- Model localized text as arrays. Legacy `messageEn/messageRu` remain projected from the first localized line and accepted on updates.
- Use local refs only. A stack/set detects circular references; independent depth/node/serialized-byte caps bound snapshots. Enum expansion uses stable sorted axes and a fixed product cap.
- Inject DNS lookup and fetch. Every redirect repeats URL/hostname/IP policy. Streamed body reading enforces a decompressed cap and also checks `content-length`; unsupported content encoding fails closed.
- One repository operation owns complete sync/bulk transactions, revisions, audit, and outbox. Controllers remain thin.
- Export JSON matching the repository presentation contract, sorted by stable key. The frontend downloads the typed payload returned by the generated client.

## Risks / Trade-offs

- Rich studio scope increases auth persistence size → keep feature-local ports and bounded snapshots rather than widening unrelated user/session repositories.
- DNS rebinding between validation and connection cannot be fully prevented by generic fetch → the injectable boundary receives validated addresses and production fetch pins the lookup result per request.
- Existing supported UI locales are EN/RU → ZH remains managed response content and coverage data, not a new application-shell locale.
- Full browser and real database lanes can be environment-limited → retain deterministic unit/provider tests and report unavailable Docker/browser proof explicitly.

## Migration Plan

1. Apply additive Postgres migration and Mongo validator/index migration.
2. Deploy code capable of reading old and new presentation records.
3. Regenerate API/contracts/clients and deploy admin/auth APIs plus admin SPA.
4. Operators configure an explicit source hostname allowlist before sync.

Rollback code first while retaining additive columns/tables/collections; old code ignores new records and continues reading legacy presentation columns. Destructive down migrations are for isolated rollback proof only.

## Open Questions

None.
