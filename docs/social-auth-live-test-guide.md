# Social auth live test input guide

Use this guide to collect live or staging inputs for end-to-end social auth testing. Do not paste real secrets into issues, chat, docs, screenshots, or test logs. Provide secret values only through the approved secret manager or CI/runtime secret store, and share the secret key names separately.

## Environment targets

Provide these non-secret target values:

- Deployment environment name: `<staging|live>`
- Frontend base URL: `<https://frontend.example.test>`
- Auth API base URL: `<https://auth-api.example.test>`
- User API base URL: `<https://user-api.example.test>`
- Admin API base URL: `<https://admin-api.example.test>`
- Telegram bot API base URL: `<https://telegram-bot-api.example.test>`
- Telegram bot worker identifier or health endpoint: `<worker-name-or-health-url>`
- Discord app API base URL: `<https://discord-app-api.example.test>`

Validation steps:

1. Confirm each base URL is reachable over HTTPS and points to the intended environment.
2. Confirm CORS/cookie domains allow the frontend to call the auth, user, admin, Telegram, and Discord APIs.
3. Confirm health endpoints report the expected version or commit before and after the test run.

## Database and migrations

Provide:

- Database or migration target name: `<staging-db-or-cluster>`
- Migration command owner/runbook: `<link-to-runbook>`
- Snapshot/backup identifier before testing: `<snapshot-id-or-backup-job-id>`
- Rollback expectation: `<restore snapshot|down migration|forward fix>`
- Data retention rule for test provider identities: `<delete-after-test-window>`

Validation steps:

1. Take or verify a restorable snapshot before migrations or destructive cleanup.
2. Run pending migrations against the target environment only.
3. Record migration version before and after testing.
4. Verify provider identity cleanup or anonymization after acceptance.

## Telegram inputs

Provide secrets through the secret manager and non-secrets through the test ticket:

- Telegram bot token secret key name: `<SECRET_KEY_TELEGRAM_BOT_TOKEN>`
- Bot username: `<bot_username>`
- Mini App/Web App URL: `<https://frontend.example.test/tma>`
- Allowed Mini App/Web App domain: `<frontend.example.test>`
- Webhook secret secret key name: `<SECRET_KEY_TELEGRAM_WEBHOOK_SECRET>`
- Webhook URL: `<https://telegram-bot-api.example.test/webhook/telegram>`
- Test Telegram user IDs: `<telegram-user-id-1>, <telegram-user-id-2>`
- TMA launch method: `<bot menu button|inline keyboard|direct t.me link>`
- Link payload scenarios:
  - Fresh link payload: `<payload-created-by-app>`
  - Expired payload: `<expired-payload-id>`
  - Already-used payload: `<used-payload-id>`
  - Mismatched-user payload: `<payload-for-other-test-user>`

Validation steps:

1. Confirm Telegram webhook registration targets the stated webhook URL and uses the configured webhook secret.
2. Launch TMA using the stated method and verify auth succeeds only with valid signed init data.
3. Exercise `/start`, `/link`, successful account linking, expired payload, duplicate payload, and wrong-user payload handling.
4. Confirm logs redact bot token, webhook secret, init data, provider token values, and link payload secrets.

## Discord inputs

Provide secrets through the secret manager and non-secrets through the test ticket:

- Discord application/client ID: `<discord-client-id>`
- Client secret secret key name: `<SECRET_KEY_DISCORD_CLIENT_SECRET>`
- Public key: `<discord-public-key>`
- Bot token secret key name, if command registration needs it: `<SECRET_KEY_DISCORD_BOT_TOKEN>`
- OAuth callback URL: `<https://auth-api.example.test/auth/discord/callback>`
- Interactions endpoint URL: `<https://discord-app-api.example.test/interactions>`
- Test guild ID: `<discord-guild-id>`
- Test Discord user IDs: `<discord-user-id-1>, <discord-user-id-2>`
- Command registration scope: `<guild:test-guild-id|global>`

Validation steps:

1. Confirm the Discord developer portal uses the stated OAuth callback and interactions endpoint URLs.
2. Register commands in the stated scope and verify `/account link` and status commands are visible to test users.
3. Complete Discord OAuth for one fresh account and one existing account.
4. Confirm invalid signature, denied OAuth, expired state, reused state, and wrong-account flows show safe errors.
5. Confirm logs redact client secret, bot token, authorization code, provider token values, and interaction signatures.

## Shared auth and session configuration

Provide:

- Provider token encryption key secret key name: `<SECRET_KEY_PROVIDER_TOKEN_ENCRYPTION_KEY>`
- Provider token encryption key ID: `<provider-token-key-id>`
- Allowed return URLs:
  - `<https://frontend.example.test/auth/callback>`
  - `<https://frontend.example.test/profile>`
  - `<https://frontend.example.test/settings>`
  - `<https://frontend.example.test/link/telegram>`
  - `<https://frontend.example.test/link/discord>`
- External auth policy flags:
  - Telegram Web Login enabled: `<true|false>`
  - Telegram TMA enabled: `<true|false>`
  - Telegram bot link enabled: `<true|false>`
  - Discord OAuth enabled: `<true|false>`
  - Discord interactions enabled: `<true|false>`
  - Step-up required for unlink: `<true|false>`
  - Last-method unlink blocked: `<true|false>`
- Redis/session configuration:
  - Redis target: `<redis-cluster-or-url-name>`
  - Session cookie domain: `<example.test>`
  - Session TTL: `<duration>`
  - CSRF/state TTL: `<duration>`

Validation steps:

1. Verify only the listed return URLs are accepted.
2. Verify session cookies use secure, HTTP-only, same-site settings appropriate for the environment.
3. Verify Redis/session keys expire and OAuth/TMA/link state cannot be reused.

## Test accounts and acceptance checklist

Provide:

- Email/password baseline account: `<email-address-owned-by-tester>`
- Account with no linked providers: `<account-id-or-email>`
- Account with Telegram linked: `<account-id-or-email>`
- Account with Discord linked: `<account-id-or-email>`
- Account with only one login method remaining: `<account-id-or-email>`
- Preferred locales to test: `en`, `ru`

Acceptance checklist:

- Email/password baseline login, profile load, settings load, logout, and re-login pass.
- Telegram Web Login creates or signs into the expected account and stores one provider identity.
- Telegram TMA login succeeds from the Mini App and does not trust unsigned or tampered client data.
- Telegram bot `/start` and `/link` complete linking for the intended user and reject expired, used, or wrong-user payloads.
- Discord OAuth creates or signs into the expected account and stores one provider identity.
- Discord `/account link` and status commands complete linking and show current status for the intended user.
- Provider identities show provider, provider user ID, display metadata, timestamps, and no plaintext provider tokens.
- Unlink requires configured step-up where enabled.
- Last-method unlink is blocked when it would leave the account without a usable sign-in method.
- Localization is verified in English and Russian for success, empty, and error states.
- Error states are safe for denied OAuth, invalid signatures, expired state, reused state, invalid TMA data, disabled provider flags, unavailable Redis/session storage, and provider API failures.
- Log review confirms no plaintext secrets, provider tokens, Telegram init data, OAuth codes, webhook secrets, link payload secrets, or session identifiers are emitted.
