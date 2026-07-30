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

### Requirement: [REQ-SOCIAL-COMMANDS-003] Bot commands and navigation are deterministic

Telegram and Discord command registration, menus, callbacks, and navigation
state SHALL dispatch only supported actions for the current provider identity.

**Evidence profile:** domain, security

**Invariants:**

- Unknown callbacks cannot invoke arbitrary handlers.
- Navigation state remains isolated by provider identity.

**Failure behavior:**

- Unsupported or malformed commands are rejected without domain side effects.

#### Scenario: Unknown bot callback

- **WHEN** a provider sends an unsupported callback identifier
- **THEN** no protected command handler executes

### Requirement: [REQ-SOCIAL-CONFIG-004] Provider configuration and copy are validated

Telegram and Discord tokens, webhook/polling modes, command definitions, locale
catalogs, and public provider metadata SHALL be validated before startup.

**Evidence profile:** domain, security, documentation

**Invariants:**

- Provider secrets are never returned or logged.
- Supported locale catalogs retain key parity.

**Failure behavior:**

- Missing or contradictory provider configuration prevents unsafe startup.

#### Scenario: Conflicting Telegram modes

- **WHEN** webhook and polling ownership conflict
- **THEN** startup rejects the configuration

### Requirement: [REQ-SOCIAL-LIFECYCLE-005] Provider runtimes recover cleanly

Webhook, polling, interaction, registration, and session adapters SHALL start,
retry, stop, and recover with bounded provider and storage failures.

**Evidence profile:** async, operations

**Invariants:**

- Shutdown stops provider polling and closes owned storage.
- Retry does not duplicate command registration or user actions.

**Failure behavior:**

- Provider or storage failure remains observable and follows bounded recovery.

#### Scenario: Polling shutdown

- **WHEN** the Telegram runtime shuts down during polling
- **THEN** polling stops and no new update is dispatched
