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
