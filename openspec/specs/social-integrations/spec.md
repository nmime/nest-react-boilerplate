# Social integrations specification

## Purpose

Keep Telegram and Discord ingress authenticated, bounded, localized, and safe
across webhook, polling, interaction, and session lifecycles.

## Requirements

### Requirement: [REQ-SOCIAL-INGRESS-001] External ingress is authenticated and bounded

Telegram webhooks and Discord interactions SHALL validate provider authenticity
before dispatch and SHALL reject malformed, replayed, or untrusted input without
executing domain actions.

**Evidence profile:** domain, security

**Invariants:**

- Provider secrets are never logged or returned.
- An unverified request cannot reach a command handler.

**Failure behavior:**

- Invalid provider input is rejected with no side effect.

#### Scenario: Invalid provider signature

- **WHEN** an external interaction cannot be authenticated
- **THEN** the adapter rejects it before application dispatch

### Requirement: [REQ-SOCIAL-SESSION-002] Bot sessions are isolated and recoverable

Bot session state SHALL be isolated by provider identity, expire predictably,
and tolerate backing-store failure without leaking another user state.

**Evidence profile:** domain, operations

**Invariants:**

- Session keys include the relevant provider/user boundary.
- Storage errors remain observable and bounded.

**Failure behavior:**

- Missing or failed session state begins safely or rejects the operation.

#### Scenario: Independent bot users

- **WHEN** two provider identities interact concurrently
- **THEN** each observes only its own session state
