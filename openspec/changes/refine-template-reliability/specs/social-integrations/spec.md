## MODIFIED Requirements

### Requirement: [REQ-SOCIAL-CONFIG-004] Provider configuration and copy are validated

Telegram and Discord tokens, webhook/polling modes, command definitions, locale
catalogs, and public provider metadata SHALL be validated before startup.

**Evidence profile:** domain, security, documentation

**Invariants:**

- Provider secrets are never returned or logged.
- Supported locale catalogs retain key parity.
- Every rendered bot command and menu label SHALL come from that bot's owned
  catalog for the current locale. Account-link callbacks and fallback screens
  SHALL never render an untranslated key from a frontend-only catalog.

**Failure behavior:**

- Missing or contradictory provider configuration prevents unsafe startup.

#### Scenario: Conflicting Telegram modes

- **WHEN** webhook and polling ownership conflict
- **THEN** startup rejects the configuration

#### Scenario: Localized Telegram link menu

- **WHEN** a Telegram user opens account linking in English, Russian, or Simplified Chinese
- **THEN** the real menu shows an owned localized link action and the callback preserves localized fallback copy
