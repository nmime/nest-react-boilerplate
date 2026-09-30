## MODIFIED Requirements

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
