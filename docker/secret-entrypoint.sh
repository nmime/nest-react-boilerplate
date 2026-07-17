#!/bin/sh
set -eu

load_secret() {
  variable="$1"
  path="$2"

  if printenv "$variable" >/dev/null 2>&1 || [ ! -f "$path" ]; then
    return
  fi

  value="$(cat "$path")"
  export "$variable=$value"
}

if [ "$(id -u)" -eq 0 ]; then
  load_secret AUTH_JWT_SECRET /run/secrets/auth_jwt_secret
  load_secret SESSION_SECRET /run/secrets/session_secret
  load_secret BETTER_AUTH_SECRET /run/secrets/better_auth_secret
  load_secret AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY /run/secrets/auth_provider_token_encryption_key
  load_secret REDIS_PASSWORD /run/secrets/redis_password
  load_secret DATABASE_URL /run/secrets/database_url
  load_secret POSTGRES_PASSWORD /run/secrets/postgres_password
  load_secret TELEGRAM_BOT_TOKEN /run/secrets/telegram_bot_token
  load_secret TELEGRAM_OIDC_CLIENT_SECRET /run/secrets/telegram_oidc_client_secret
  load_secret TELEGRAM_BOT_WEBHOOK_SECRET /run/secrets/telegram_bot_webhook_secret
  load_secret DISCORD_BOT_TOKEN /run/secrets/discord_bot_token
  load_secret DISCORD_CLIENT_SECRET /run/secrets/discord_client_secret
  load_secret DISCORD_PUBLIC_KEY /run/secrets/discord_public_key

  exec su-exec node "$@"
fi

exec "$@"
