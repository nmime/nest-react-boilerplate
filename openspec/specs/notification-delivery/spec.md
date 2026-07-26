# Notification delivery specification

## Purpose

Keep notification templates, audiences, scheduling, delivery, and retry
behavior explicit, tenant-safe, and auditable.

## Requirements

### Requirement: [REQ-NOTIFY-DELIVERY-001] Delivery channels and providers are explicit

Every queued delivery SHALL identify a supported external delivery channel and
provider. In-app content MUST NOT be accepted as an external delivery channel.

**Evidence profile:** acceptance, domain

**Invariants:**

- Delivery attempts are attributable to one notification and provider.
- Unsupported channels fail before provider dispatch.

**Failure behavior:**

- Unsupported channel or provider combinations are rejected without a send.

#### Scenario: In-app content is not externally dispatched

- **WHEN** in-app content is evaluated as a delivery channel
- **THEN** it is rejected for external delivery

### Requirement: [REQ-NOTIFY-LIFECYCLE-002] Broadcast state changes are auditable and idempotent

Scheduling, approval, pause, resume, cancellation, and retry SHALL preserve
tenant ownership and idempotent delivery state.

**Evidence profile:** domain, operations

**Invariants:**

- Reprocessing never creates an untracked duplicate delivery.
- Terminal cancellation is not silently resumed.

**Failure behavior:**

- Invalid state transitions are rejected and observable.

#### Scenario: Reprocessed delivery

- **WHEN** an already materialized audience is processed again
- **THEN** the existing delivery identity is preserved

### Requirement: [REQ-NOTIFY-TEMPLATE-003] Templates and channels remain versioned and localized

Notification templates, versions, channel payloads, and locale selection SHALL
produce deterministic content for the selected tenant, event, and recipient.

**Evidence profile:** domain, persistence

**Invariants:**

- Published template versions are immutable.
- Required channel fields remain typed and localized.

**Failure behavior:**

- Missing, invalid, or unpublished template content prevents delivery.

#### Scenario: Missing channel template

- **WHEN** a delivery has no published content for its channel
- **THEN** provider dispatch does not occur

### Requirement: [REQ-NOTIFY-AUDIENCE-004] Audience materialization is tenant-safe

Segments, uploads, snapshots, filters, and recipient resolution SHALL preserve
tenant ownership, deterministic membership, and bounded input validation.

**Evidence profile:** domain, persistence, security

**Invariants:**

- Audience snapshots cannot contain another tenant's members.
- Re-materialization preserves stable membership identity.

**Failure behavior:**

- Invalid uploads, filters, or ownership reject the audience operation.

#### Scenario: Cross-tenant segment

- **WHEN** a broadcast references another tenant's segment
- **THEN** materialization is rejected before delivery creation

### Requirement: [REQ-NOTIFY-PERSISTENCE-005] Delivery payloads and retries are durable and protected

Notification commands, deliveries, payload encryption, retry schedules, and
outbox records SHALL preserve confidentiality, uniqueness, and recoverability.

**Evidence profile:** persistence, security, async

**Invariants:**

- Encrypted payloads are not persisted in plaintext.
- A retry preserves delivery identity and attempt history.

**Failure behavior:**

- Encryption, persistence, or scheduling failure prevents unsafe dispatch.

#### Scenario: Payload encryption failure

- **WHEN** a protected delivery payload cannot be encrypted
- **THEN** no plaintext delivery record is persisted

### Requirement: [REQ-NOTIFY-PREFERENCE-006] Recipient preferences govern optional delivery

Session and user notification preferences SHALL be validated, scoped to the
current principal, and applied consistently across frontend controls and
backend delivery eligibility.

**Evidence profile:** domain, journey

**Invariants:**

- Preference changes cannot target another user.
- Mandatory security notifications remain governed by explicit policy.

**Failure behavior:**

- Invalid or unavailable preference state fails safely without widening sends.

#### Scenario: Disabled optional channel

- **WHEN** a recipient disables an optional delivery channel
- **THEN** new optional deliveries do not use that channel
