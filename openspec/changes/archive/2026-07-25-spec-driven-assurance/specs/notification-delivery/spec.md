## ADDED Requirements

### Requirement: [REQ-NOTIFY-DELIVERY-001] Delivery channels and providers are explicit

Every external delivery SHALL identify a supported channel and provider; in-app
content MUST NOT be dispatched as an external channel.

#### Scenario: In-app content

- **WHEN** in-app content is evaluated for external delivery
- **THEN** it is rejected

### Requirement: [REQ-NOTIFY-LIFECYCLE-002] Broadcast state changes are auditable and idempotent

Scheduling, approval, pause, resume, cancellation, and retry SHALL preserve
tenant ownership and idempotent delivery state.

#### Scenario: Reprocessed delivery

- **WHEN** a materialized audience is processed again
- **THEN** existing delivery identity is preserved
