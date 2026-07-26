## ADDED Requirements

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
