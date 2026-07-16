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
  load_secret DATABASE_URL /run/secrets/database_url
  load_secret POSTGRES_PASSWORD /run/secrets/postgres_password
  load_secret TELEGRAM_BOT_TOKEN /run/secrets/telegram_bot_token
  load_secret TELEGRAM_BOT_WEBHOOK_SECRET /run/secrets/telegram_bot_webhook_secret
  load_secret DISCORD_BOT_TOKEN /run/secrets/discord_bot_token
  load_secret DISCORD_PUBLIC_KEY /run/secrets/discord_public_key

  exec su-exec node "$@"
fi

exec "$@"
