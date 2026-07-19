# Social auth, Telegram Mini Apps, and bots

This document records the implemented social-auth and bot integration surface for Telegram, Telegram Mini Apps (TMA), and Discord. The user frontend includes a production Mini App entry at `/telegram-mini-app` and keeps the `/tma` and `/tma/auth` aliases for existing bot links.

## Architecture

The architecture keeps provider verification and account linking in the auth boundary while keeping bot transports thin:

- `auth-app-api` owns the Better Auth OIDC callback, signed TMA validation, account-link decisions, auto-provision policy, step-up checks, and provider-token encryption.
- Telegram bot and Discord interaction handlers should call auth/application services through explicit internal APIs or shared ports, not by reaching into persistence models directly.
- Frontend/TMA shells should use generated API clients once contracts exist. Avoid raw endpoint paths in feature code.
- Provider identities should be stored separately from local credentials so unlink/last-method checks can prevent account lockout.
- User-visible text must come from root thin i18n catalogs (`i18n/en/user/social-auth.json`, `i18n/en/bots/telegram.json`, `i18n/en/bots/discord.json`, and matching `i18n/ru/**` files) through `TranslationKey` values.

## Telegram OIDC and Telegram Mini Apps

Telegram web sign-in uses Telegram's current OpenID Connect authorization-code flow through Better Auth's generic OAuth provider. The provider id is `telegram`, PKCE is mandatory, and the returned ID token is verified against Telegram's issuer, audience, expiry, allowed algorithms, and JWKS before any user or account is created. Telegram currently has no UserInfo endpoint, so verified ID-token claims are mapped to the Better Auth account. Register the callback on the same public origin used for every Better Auth browser request:

```text
# Default same-origin deployment
https://user-app.example.com/api/auth/oauth2/callback/telegram

# Split-origin deployment
https://auth-app-api.example.com/api/auth/oauth2/callback/telegram
```

The user SPA starts the flow with `POST /api/auth/sign-in/oauth2`, returns to `/auth/telegram/callback`, and calls `POST /auth/telegram/oidc/session`. The last endpoint accepts only a valid Better Auth session that contains a numeric Telegram account id, then projects that identity into the tenant/RBAC auth model and issues the application session. Link intent data stays in `sessionStorage`; it is not placed in the provider callback URL. `BETTER_AUTH_URL`, the registered Telegram callback origin, and the frontend Better Auth base must always be the same host so the state/session cookies are present on callback.

Use the maintained `@tma.js` stack for Telegram Mini App client work. Deprecated Telegram Web App helper packages are intentionally banned by static checks; extend the guard tests before changing the approved SDK policy.

Recommended TMA flow:

1. Load TMA launch parameters with `@tma.js` in the Mini App shell.
2. Send only raw Telegram `initData` to `POST /api/auth/telegram/tma` over HTTPS. Better Auth validates the signature and the five-minute `auth_date` window, creates or finds the same `providerId=telegram` account used by OIDC, creates its database session, and returns its secure session cookie.
3. Send the same raw `initData` to `POST /auth/telegram/tma`. The tenant/RBAC auth boundary validates it independently and creates the application session.
4. If the user is signed in, offer link/unlink with step-up when required.
5. If the user is not signed in, apply `EXTERNAL_AUTH_AUTO_PROVISION_ENABLED` before creating a local account.
6. Return localized states using `tma.*`, `tma.deepNavigation.*`, `deepNav.*`, and `auth.social.*` keys.

The frontend never trusts `initDataUnsafe` or a client-submitted Telegram profile. A Telegram ID always maps to the synthetic Better Auth email `telegram-<id>@telegram.invalid`; email matching cannot implicitly link Telegram to a password or another provider account.

Important env values:

- `AUTH_TELEGRAM_ENABLED`
- `TELEGRAM_TMA_MAX_AGE_SECONDS` (default `300`)
- `TELEGRAM_OIDC_ENABLED`
- `TELEGRAM_OIDC_CLIENT_ID`
- `TELEGRAM_OIDC_CLIENT_SECRET` or `TELEGRAM_OIDC_CLIENT_SECRET_FILE`
- `TELEGRAM_OIDC_SCOPES` (default `openid profile`)
- `BETTER_AUTH_SECRET` or `BETTER_AUTH_SECRET_FILE`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `AUTH_ALLOWED_RETURN_URLS` (absolute frontend origins; relative values are rejected)
- `VITE_TELEGRAM_AUTH_ENABLED` (build-time user-app flag)
- `TELEGRAM_MINI_APP_URL` (canonical Mini App/Open App URL, for example `https://user-app.example.com/telegram-mini-app`)
- `TELEGRAM_WEB_APP_URL` / `TELEGRAM_TMA_URL` (backward-compatible aliases consumed by the bot resolver)
- `TELEGRAM_LINK_TOKEN_TTL_SECONDS`

## Telegram bots with grammY

Use grammY for future Telegram bot handlers and plugins. Keep bot code transport-focused:

- Use webhook mode in production when a public HTTPS endpoint is available.
- Use polling/worker mode only for local development or controlled worker deployments where webhooks are not available.
- Validate webhook secret tokens when `TELEGRAM_BOT_MODE=webhook`.
- Keep session, menu, rate-limit, and i18n plugins close to the bot adapter.
- Keep account-link tokens short lived and single use.

The bot publishes its private-chat command menu on startup in English and
Russian. The commands are `/start`, `/app`, `/profile`, `/settings`,
`/language`, `/support`, and `/link`; `/app` is omitted when the Mini App URL is
missing or unsafe. With `TELEGRAM_BOT_MENU_BUTTON_ENABLED=true` (the scaffold
default), users can launch the same canonical TMA from the persistent chat menu
button, the `/start` inline menu, and the `/app` command. In webhook mode,
startup also registers the configured HTTPS `TELEGRAM_BOT_WEBHOOK_URL` with
Telegram using the configured secret token.

Bot copy keys are grouped as:

- `bot.menu.*` for keyboard/menu labels such as main, profile, settings, language, support, link, unlink, back, home, and cancel.
- `bot.route.*` for route transition messages.
- `bot.error.*` for expired actions, rate limits, unauthorized actions, unavailable service, and link/unlink failures.
- `bot.message.*` for generic bot messages.

Important env values:

- `TELEGRAM_BOT_TOKEN` or `TELEGRAM_BOT_TOKEN_FILE`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_BOT_WEBHOOK_SECRET` or `TELEGRAM_BOT_WEBHOOK_SECRET_FILE`
- `TELEGRAM_BOT_MODE`
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
- `DISCORD_APPLICATION_ID`
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
- Keep the TMA `auth_date` window short and one-time link tokens single use.
- Keep Better Auth's OIDC state in the database and require PKCE.
- Prevent unlinking the final sign-in method.
- Require step-up for sensitive account-link changes after the configured age.
- Log provider ids with care and never log provider access tokens, bot tokens, or webhook secrets.

## Local development

1. Copy `.env.local.example` to `.env.local`.
2. Keep provider features disabled until the bot token, OIDC credentials, trusted frontend origin, and callback URL are configured.
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

When adding runtime features, add keys to both locale catalogs and the `TranslationKey` union in `libs/common/i18n/keys/lib/src/index.ts`, then update focused i18n tests. Supported locales are owned by `libs/common/i18n/runtime/lib/src/runtime.ts`. Keep web social-auth/TMA copy under `i18n/<locale>/user/**`; keep Telegram bot and Discord interaction copy under `i18n/<locale>/bots/**` so frontend app bundles stay bot-copy free.

## Rollout plan

1. Keep docs/env/i18n/static guards current with every provider flow change.
2. Maintain backend contracts, provider persistence, TMA verification, bot adapters, and Discord OAuth callbacks in provider-owned branches.
3. Maintain the user frontend routes for `/telegram-mini-app`, `/tma`, `/tma/auth`, `/link/telegram`, `/link/discord`, `/auth/telegram/callback`, and `/auth/discord/callback` with focused regression tests.
4. Run local validation, CI, staged rollout, and provider-specific smoke tests before enabling production flags.

## Mini App frontend route and API URL mode

Use `TELEGRAM_MINI_APP_URL=https://<user-frontend-host>/telegram-mini-app` for production.
The same frontend bundle also supports `/tma` and `/tma/auth` as compatibility aliases. Configure BotFather's Mini App/Web App domain to the frontend host only; never point it at the auth API, bot webhook, backend root, or a raw backend service.

The `user-app` root is wrapped by the shared `MiniAppProvider` and
`MiniAppShell`, so every route uses the same browser/TMA compatibility layer.
Telegram launches receive branded header and bottom-bar colors, expanded and
fullscreen negotiation, native BackButton handling, and safe-area-aware
full-height layout. Normal browsers keep the same shell and fall back to browser
history plus Web Share, clipboard, or the Telegram share URL. Page features must
not mount Telegram viewport, swipe behavior, or BackButton APIs independently.
The provider disables Telegram's vertical close/minimize swipe while mounted,
then restores it during cleanup; normal document scrolling remains available
for app content.

BotFather still owns the bot-profile **Main Mini App** button and allowed Mini
App domain; Telegram does not expose those two bot-profile settings through the
Bot API. During initial provider setup, configure the Main Mini App URL as
`https://user-app.example.com/telegram-mini-app` and the domain as
`user-app.example.com`. Runtime startup then wires the webhook, command menu,
persistent chat menu button, and in-message launch buttons automatically.

The Mini App frontend can be built in either API URL mode:

- Same-origin reverse-proxy mode: set `VITE_API_BASE_URL_MODE=same-origin` and leave `VITE_AUTH_API_BASE_URL` / `VITE_USER_API_BASE_URL` / `VITE_ADMIN_API_BASE_URL` empty. Better Auth requests use `/api/auth/*`; tenant/RBAC requests use `/auth/*`. The production proxy routes both prefixes to `auth-app-api`. Social-auth requests send an absolute URL on that same origin, and the frontend converts a validated same-origin response back to a router path.
- Split-origin mode: set explicit `VITE_AUTH_API_BASE_URL` and `VITE_USER_API_BASE_URL` origins. Production builds fail closed unless explicit API origins or same-origin mode are configured.

The TMA login/link flow submits raw Telegram `initData` to the backend for validation. It intentionally does not read unsafe client-side Telegram launch objects or trust client-provided Telegram profile data.

Use `startapp=link_telegram`, `startapp=link_discord`, or `startapp=link` for account-link launches. The frontend treats those payloads as `intent: link` and keeps return URLs on safe same-origin routes. `/link/telegram` enters the Mini App link flow directly; `/auth/discord/callback` is handled as an SPA route with provider-specific Discord status copy.
