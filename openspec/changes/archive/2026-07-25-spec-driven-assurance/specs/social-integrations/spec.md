## ADDED Requirements

### Requirement: [REQ-SOCIAL-INGRESS-001] External ingress is authenticated and bounded

Telegram and Discord ingress SHALL validate provider authenticity before
dispatch and reject malformed, replayed, or untrusted input without side effects.

#### Scenario: Invalid provider signature

- **WHEN** an interaction cannot be authenticated
- **THEN** it is rejected before application dispatch

### Requirement: [REQ-SOCIAL-SESSION-002] Bot sessions are isolated and recoverable

Bot sessions SHALL be isolated by provider identity, expire predictably, and
never leak another user's state on backing-store failure.

#### Scenario: Independent users

- **WHEN** two identities interact concurrently
- **THEN** each observes only its own session state
