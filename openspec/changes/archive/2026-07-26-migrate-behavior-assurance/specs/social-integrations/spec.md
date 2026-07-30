## ADDED Requirements

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
