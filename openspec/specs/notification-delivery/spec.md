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

**Evidence profile:** domain, persistence, operations

**Invariants:**

- Reprocessing never creates an untracked duplicate delivery.
- Terminal cancellation is not silently resumed.
- Admin template, segment, upload, broadcast, command, and test-send persistence
  SHALL share the exact PostgreSQL transaction manager or native MongoDB session
  supplied by audit recording. Mutation, audit row, and outbox event commit or
  roll back together; no independently committed inner mutation is allowed.
- Reads needed to construct the mutation result and audit snapshot use that same
  transaction, and native MongoDB operations within it execute sequentially.
- External object uploads remain outside database atomicity. A failed upload
  registration never queues processing; unreferenced objects may require cleanup.

**Failure behavior:**

- Invalid state transitions are rejected and observable.
- Audit or outbox persistence failure rejects the admin mutation and leaves no
  changed notification state, version, delivery, upload registration, or command.

#### Scenario: Reprocessed delivery

- **WHEN** an already materialized audience is processed again
- **THEN** the existing delivery identity is preserved

#### Scenario: Audit persistence failure after a notification mutation

- **WHEN** an admin mutation completes its notification writes but audit or outbox insertion fails
- **THEN** PostgreSQL and MongoDB roll back every related database write, and the API reports failure

### Requirement: [REQ-NOTIFY-TEMPLATE-003] Templates and channels remain versioned and localized

Notification templates, versions, channel payloads, and locale selection SHALL
produce deterministic content for the selected tenant, event, and recipient.

**Evidence profile:** domain, persistence

**Invariants:**

- Published template versions are immutable.
- Required channel fields remain typed and localized.
- Template selection considers only the principal tenant first and the explicitly shared `tenantId=null` template second.
- A candidate is usable only when its current version is published and supports every requested delivery and in-app channel.
- An unusable tenant override does not block a usable shared fallback, and another tenant's template is never eligible.

**Failure behavior:**

- Missing, invalid, unpublished, or channel-incomplete tenant and shared candidates prevent delivery with the existing template-channel error.

#### Scenario: Missing channel template

- **WHEN** neither the principal tenant candidate nor the shared candidate has published content for every requested channel
- **THEN** provider dispatch does not occur

#### Scenario: Shared fallback after an unusable tenant override

- **WHEN** the principal tenant's template is unpublished or lacks a requested channel and a usable shared template exists
- **THEN** the shared template is selected without considering another tenant's template

### Requirement: [REQ-NOTIFY-AUDIENCE-004] Audience materialization is tenant-safe

Segments, uploads, snapshots, filters, and recipient resolution SHALL preserve
tenant ownership, deterministic membership, and bounded input validation.

**Evidence profile:** domain, persistence, security

**Invariants:**

- Audience snapshots cannot contain another tenant's members.
- Notification, delivery, claim, broadcast, and recipient-resolution persistence carry the principal tenant scope.
- Re-materialization preserves stable membership identity.

**Failure behavior:**

- Invalid uploads, filters, or ownership reject the audience operation.
- Missing or ambiguous legacy notification ownership refuses migration before any partial backfill is committed.

#### Scenario: Cross-tenant segment

- **WHEN** a broadcast references another tenant's segment
- **THEN** materialization is rejected before delivery creation

#### Scenario: Ambiguous legacy notification ownership

- **WHEN** a legacy ordinary notification cannot resolve ownership from a tenant-owned source
- **THEN** the ownership migration refuses the dataset and commits no partial backfill

### Requirement: [REQ-NOTIFY-PERSISTENCE-005] Delivery payloads and retries are durable and protected

Notification commands, deliveries, payload encryption, retry schedules, and
outbox records SHALL preserve confidentiality, uniqueness, and recoverability.

**Evidence profile:** persistence, security, async

**Invariants:**

- Encrypted payloads are not persisted in plaintext.
- AES-GCM payload decryption requires the complete 16-byte authentication tag.
- A retry preserves delivery identity and attempt history.
- Notification consumer and scheduler hosts retain the shared private HTTP
  bootstrap for operational health, disable browser cookie sessions and CORS,
  and expose no notification, payment, or fiat product HTTP controllers.

**Failure behavior:**

- Encryption, persistence, or scheduling failure prevents unsafe dispatch.

#### Scenario: Payload encryption failure

- **WHEN** a protected delivery payload cannot be encrypted
- **THEN** no plaintext delivery record is persisted

#### Scenario: Truncated payload authentication tag

- **WHEN** an encrypted notification carries a shortened or oversized tag
- **THEN** both database adapters reject decryption without returning sensitive data

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
