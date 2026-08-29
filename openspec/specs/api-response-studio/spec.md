# API Response Studio specification

## Purpose

Provide a tenant-scoped, product-neutral administration surface for safe OpenAPI response synchronization, rich presentation configuration, deterministic export, and capable-consumer runtime behavior.

## Requirements

### Requirement: [REQ-API-RESPONSE-STUDIO-001] Rich presentations remain safe and compatible

The system SHALL preserve existing toast/silent EN/RU overrides and SHALL support toast, modal, custom, and silent presentations with severity, support metadata, optional safe custom/Figma description, figma-only flag, comments, EN/RU/ZH text arrays, revision, actor, and timestamps.

**Evidence profile:** domain, api, security

**Invariants:**

- Silent remains silent and toast remains toast.
- Modal/custom presentations are exposed as typed data and never emitted as an accidental toast.
- Populated languages use the same balanced variables and allowed balanced markup.
- Cyrillic and Chinese text are valid.

**Failure behavior:**

- Invalid length, control character, placeholder, tag, or unsupported display data is rejected before persistence.

#### Scenario: Capable consumer receives a modal presentation

- **WHEN** a modal override is loaded for a matching response
- **THEN** the consumer receives typed modal presentation data and the toast runtime emits no toast

### Requirement: [REQ-API-RESPONSE-STUDIO-002] OpenAPI sources sync manually through a fail-closed boundary

The system SHALL manage tenant-scoped OpenAPI source records and SHALL synchronize them only on explicit admin request through HTTPS URLs whose host is configured, DNS/IP answers and redirect targets are public, and whose bounded response is JSON object data declaring OpenAPI 3.x.

**Evidence profile:** domain, security, api

**Invariants:**

- Source reads and mutations require the existing settings permission pair.
- No scheduler or cron is enabled by default.
- Tests inject deterministic DNS and fetch boundaries without live network access.

**Failure behavior:**

- Unsafe URL, DNS/IP, redirect, timeout, media type, size, JSON shape, or OpenAPI version fails without changing synchronized data.

#### Scenario: Redirect targets a private address

- **WHEN** an allowlisted source redirects to a hostname resolving to a private address
- **THEN** synchronization fails before requesting the private target

### Requirement: [REQ-API-RESPONSE-STUDIO-003] OpenAPI parsing and synchronization are bounded and idempotent

The system SHALL parse non-health OpenAPI paths, methods, tags, operation identifiers, summaries, responses, local and transitive external component references, schema unions, circular references, examples, enum variants, and synthetic ERR/NET variants within explicit depth, size, per-enum, and deterministic expansion caps.

**Evidence profile:** domain, persistence

**Invariants:**

- Deterministic stable keys identify source response variants.
- Removed variants are soft-deleted and user presentation configuration is preserved.
- Persisted enum choices control deterministic capped expansion.
- Concurrent sync/update uses transaction and expected revision semantics.

**Failure behavior:**

- Snapshot exhaustion truncates deterministically; an oversized enabled enum fails before writes, while a larger safe Cartesian product is expanded in stable order only up to the configured output cap.

#### Scenario: Repeated unchanged sync

- **WHEN** the same OpenAPI document is synchronized twice
- **THEN** the second result reports no created, modified, or deleted variants and preserves revisions and user configuration

### Requirement: [REQ-API-RESPONSE-STUDIO-004] Admin mutations are atomic, tenant-scoped, audited, and exportable

The admin API SHALL expose source dashboard and overview, filtered inventory, source create/update, sync, row update/reset, bounded atomic bulk update, dismiss, deterministic export, and filtered history using `admin:settings:read` for reads and `admin:settings:update` for mutations.

**Evidence profile:** api, persistence, security

**Invariants:**

- Every query and mutation includes tenant identity.
- Bulk updates validate every expected revision before any row changes.
- Mutation, audit record, and outbox event commit or roll back together.
- Audit/outbox snapshots are bounded and exclude credentials and authorization headers.
- Export ordering, keys, escaping, filename, media type, and size are deterministic.

**Failure behavior:**

- Missing rows, stale revisions, or any invalid bulk row roll back the whole mutation with RFC 9457 failure behavior.

#### Scenario: Stale row in a bulk update

- **WHEN** one selected row carries a stale expected revision
- **THEN** no selected row changes and no mutation audit/outbox record is committed

### Requirement: [REQ-API-RESPONSE-STUDIO-005] The existing admin settings route provides the complete studio journey

The admin SPA SHALL evolve `/admin/settings/errors` into API Response Studio with source statistics and translation coverage, source management and sync controls, grouped/filterable inventory, all/group/path/row selection, row and atomic bulk editors, dismiss, bounded schema/example viewer, export, history, and localized responsive accessible states.

**Evidence profile:** domain, journey, accessibility

**Invariants:**

- The existing route/navigation entry remains the owner.
- Shared UI and generated clients are used without product-specific branding.
- Read-only users can inspect/export/history but cannot mutate.
- The layout preserves keyboard labels/focus and the 320 px floor, including Russian at 375 px.

**Failure behavior:**

- Loading, empty, request error, validation error, conflict, and read-only states remain recoverable and accessible.

#### Scenario: Read-only administrator opens the studio

- **WHEN** an administrator has settings read but not update permission
- **THEN** dashboard, filters, viewers, export, and history are available while source, sync, edit, bulk, and dismiss controls are disabled or absent
