# Social auth, Telegram Mini Apps, and bots

This document records the social-auth and bot integration surface for Telegram, Telegram Mini Apps (TMA), and Discord. The user frontend includes a production Mini App entry at `/telegram-mini-app` and keeps the legacy `/tma` and `/tma/auth` aliases for existing bot links.

## Architecture

The planned architecture keeps provider verification and account linking in the auth boundary while keeping bot transports thin:

- `auth-app-api` owns OAuth/TMA callback verification, state validation, replay protection, account-link decisions, auto-provision policy, step-up checks, and provider-token encryption.
- Telegram bot and Discord interaction handlers should call auth/application services through explicit internal APIs or shared ports, not by reaching into persistence models directly.
- Frontend/TMA shells should use generated API clients once contracts exist. Avoid raw endpoint paths in feature code.
- Provider identities should be stored separately from local credentials so unlink/last-method checks can prevent account lockout.
- User-visible text must come from root thin i18n catalogs (`i18n/en/social-auth.json`, `i18n/en/bot.json`, `i18n/en/discord.json`, and matching `i18n/ru/*.json` files) through `TranslationKey` values.

## Telegram web login and Telegram Mini Apps

Use the maintained `@tma.js` stack for future Telegram Mini App client work. Deprecated Telegram Web App helper packages are intentionally banned by static checks; extend the guard tests before changing the approved SDK policy.

Recommended TMA flow:

1. Load TMA launch parameters with `@tma.js` in the Mini App shell.
2. Send Telegram init data to the auth API over HTTPS.
3. The auth API verifies the hash with the configured bot token, checks max-age and replay cache TTL, and maps the Telegram user id to a provider identity.
4. If the user is signed in, offer link/unlink with step-up when required.
5. If the user is not signed in, apply `EXTERNAL_AUTH_AUTO_PROVISION_ENABLED` before creating a local account.
6. Return localized states using `tma.*`, `tma.deepNavigation.*`, `deepNav.*`, and `auth.social.*` keys.

Important env values:

- `TELEGRAM_AUTH_ENABLED`
- `TELEGRAM_AUTH_BOT_USERNAME`
- `TELEGRAM_AUTH_MAX_AGE_SECONDS`
- `TELEGRAM_AUTH_REPLAY_TTL_SECONDS`
- `TELEGRAM_MINI_APP_URL` (canonical Mini App/Open App URL, for example `https://app.example.com/telegram-mini-app`)
- `TELEGRAM_WEB_APP_URL` / `TELEGRAM_TMA_URL` (backward-compatible aliases consumed by the bot resolver)
- `TELEGRAM_LINK_TOKEN_TTL_SECONDS`

## Telegram bots with grammY

Use grammY for future Telegram bot handlers and plugins. Keep bot code transport-focused:

- Use webhook mode in production when a public HTTPS endpoint is available.
- Use polling/worker mode only for local development or controlled worker deployments where webhooks are not available.
- Validate webhook secret tokens when `TELEGRAM_BOT_WEBHOOK_MODE=webhook`.
- Keep session, menu, rate-limit, and i18n plugins close to the bot adapter.
- Keep account-link tokens short lived and single use.

Bot copy keys are grouped as:

- `bot.menu.*` for keyboard/menu labels such as main, profile, settings, language, support, link, unlink, back, home, and cancel.
- `bot.route.*` for route transition messages.
- `bot.error.*` for expired actions, rate limits, unauthorized actions, unavailable service, and link/unlink failures.
- `bot.message.*` for generic bot messages.

Important env values:

- `TELEGRAM_BOT_TOKEN` or `TELEGRAM_BOT_TOKEN_FILE`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_BOT_WEBHOOK_SECRET` or `TELEGRAM_BOT_WEBHOOK_SECRET_FILE`
- `TELEGRAM_BOT_WEBHOOK_MODE`
- `TELEGRAM_BOT_WEBHOOK_URL`

## Discord OAuth, bot commands, and interactions

Planned Discord support has two pieces:

- OAuth/social login for web account creation and account linking.
- Discord bot/interactions for slash commands and components.

Recommended flow:

1. Start OAuth with state stored for `EXTERNAL_AUTH_STATE_TTL_SECONDS`.
2. Request configured `DISCORD_SCOPES`; default examples include `identify email guilds.join`.
3. Verify the callback state and exchange the code with `DISCORD_CLIENT_ID` plus `DISCORD_CLIENT_SECRET` or its file equivalent.
4. Encrypt provider refresh/access tokens only when storage is required, using `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY` or `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE`.
5. Register slash commands only when `DISCORD_COMMAND_REGISTRATION_ENABLED=true` in the intended environment.
6. Verify Discord interaction signatures with `DISCORD_PUBLIC_KEY` or `DISCORD_PUBLIC_KEY_FILE`.
7. Localize command labels/descriptions/messages with `discord.commands.*`, `discord.components.*`, and `discord.messages.*` keys.

Important env values:

- `DISCORD_AUTH_ENABLED`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET` or `DISCORD_CLIENT_SECRET_FILE`
- `DISCORD_REDIRECT_URI`
- `DISCORD_SCOPES`
- `DISCORD_BOT_TOKEN` or `DISCORD_BOT_TOKEN_FILE`
- `DISCORD_PUBLIC_KEY` or `DISCORD_PUBLIC_KEY_FILE`
- `DISCORD_COMMAND_REGISTRATION_ENABLED`
- `DISCORD_INTERACTIONS_ENDPOINT`
- `DISCORD_INTERACTIONS_STATE_TTL_SECONDS`

## External auth policy and security

Policy env values apply across providers:

- `EXTERNAL_AUTH_AUTO_PROVISION_ENABLED`: whether verified provider identities may create local accounts.
- `EXTERNAL_AUTH_STEP_UP_MAX_AGE_SECONDS`: how fresh a trusted confirmation must be before sensitive link/unlink actions.
- `EXTERNAL_AUTH_LINK_TOKEN_TTL_SECONDS`: signed link-token lifetime.
- `EXTERNAL_AUTH_STATE_TTL_SECONDS`: OAuth/TMA state lifetime.
- `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY` / `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE`: encryption material for provider tokens.
- `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_ID`: rotation identifier stored with encrypted provider tokens.

Security checklist:

- Never commit real Telegram bot tokens, Discord bot tokens, Discord client secrets, provider encryption keys, or webhook secrets.
- Use secret-file variants in production examples and real deployments where supported by the runtime.
- Keep production inline secret values commented out in `.env.production.example`.
- Enforce replay protection for Telegram init data and one-time link tokens.
- Enforce state TTLs for OAuth/TMA flows.
- Prevent unlinking the final sign-in method.
- Require step-up for sensitive account-link changes after the configured age.
- Log provider ids with care and never log provider access tokens, bot tokens, or webhook secrets.

## Local development

1. Copy `.env.local.example` to `.env.local`.
2. Keep provider features disabled until credentials and callback URLs are configured.
3. For Telegram webhook testing, use a stable HTTPS tunnel and set `TELEGRAM_BOT_WEBHOOK_URL` to the tunneled callback; otherwise use polling in local-only workers.
4. For TMA testing, set `TELEGRAM_MINI_APP_URL` to the local frontend `/telegram-mini-app` route exposed through a Telegram-compatible HTTPS tunnel. The Telegram Open App button is hidden when the configured URL is missing or fails the frontend-URL safety checks, so users get the localized bot fallback menu instead of an unsafe API/root link.
5. For Discord interactions, set `DISCORD_INTERACTIONS_ENDPOINT` to a public HTTPS tunnel and configure the Discord application public key.
6. Run `pnpm run tooling:static-check` and `pnpm run test:security:secrets` before committing.

## I18n conventions

Use stable key prefixes by surface:

- `auth.provider.*` for provider display labels.
- `auth.social.*` for web social-auth buttons, statuses, conflict messages, step-up copy, last-method copy, link/unlink copy, create-account copy, and callback errors.
- `tma.*` for Telegram Mini App loading, unsupported, authenticated, link, and deep-navigation states.
- `deepNav.*` for provider-neutral deep-link states.
- `bot.menu.*`, `bot.route.*`, `bot.error.*`, and `bot.message.*` for Telegram bot copy.
- `discord.commands.*`, `discord.components.*`, and `discord.messages.*` for Discord slash-command and component copy.

When adding runtime features, add keys to both locale catalogs and the `TranslationKey` union in `libs/common/i18n/lib/src/locales.ts`, then update focused i18n tests.

## Rollout plan

1. Keep docs/env/i18n/static guards current with every provider flow change.
2. Maintain backend contracts, provider persistence, TMA verification, bot adapters, and Discord OAuth callbacks in provider-owned branches.
3. Maintain the user frontend routes for `/telegram-mini-app`, `/tma`, `/tma/auth`, `/link/telegram`, `/link/discord`, and `/auth/discord/callback` with focused regression tests.
4. Run local validation, CI, staged rollout, and provider-specific smoke tests before enabling production flags.

## Mini App frontend route and API URL mode

Use `TELEGRAM_MINI_APP_URL=https://<user-frontend-host>/telegram-mini-app` for production.
The same frontend bundle also supports `/tma` and `/tma/auth` as compatibility aliases. Configure BotFather's Mini App/Web App domain to the frontend host only; never point it at the auth API, bot webhook, backend root, or a raw backend service.

The Mini App frontend can be built in either API URL mode:

- Same-origin reverse-proxy mode: set `VITE_API_BASE_URL_MODE=same-origin` and leave `VITE_AUTH_API_BASE_URL` / `VITE_USER_API_BASE_URL` empty. TMA verification posts to `/auth/telegram/tma` on the frontend origin and relies on the production proxy to route it to auth API.
- Split-origin mode: set explicit `VITE_AUTH_API_BASE_URL` and `VITE_USER_API_BASE_URL` origins. Production builds fail closed unless explicit API origins or same-origin mode are configured.

The TMA login/link flow submits raw Telegram `initData` to the backend for validation. It intentionally does not read client-side Telegram user objects or trust client-provided Telegram profile data.

Use `startapp=link_telegram`, `startapp=link_discord`, or `startapp=link` for account-link launches. The frontend treats those payloads as `intent: link` and keeps return URLs on safe same-origin routes. `/link/telegram` enters the Mini App link flow directly; `/auth/discord/callback` is handled as an SPA route with provider-specific Discord status copy.
