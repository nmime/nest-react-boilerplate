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

has_declared_docker_secret() {
  for path in \
    /run/secrets/session_secret \
    /run/secrets/better_auth_secret \
    /run/secrets/auth_provider_token_encryption_key \
    /run/secrets/notification_payload_encryption_key \
    /run/secrets/redis_password \
    /run/secrets/database_url \
    /run/secrets/postgres_password \
    /run/secrets/telegram_bot_token \
    /run/secrets/telegram_oidc_client_secret \
    /run/secrets/telegram_bot_webhook_secret \
    /run/secrets/discord_bot_token \
    /run/secrets/discord_client_secret \
    /run/secrets/discord_public_key \
    /run/secrets/discord_custom_id_secret \
    /run/secrets/resend_api_key \
    /run/secrets/mailpace_server_token \
    /run/secrets/notification_fcm_private_key \
    /run/secrets/notification_apns_private_key
  do
    if [ -f "$path" ]; then
      return 0
    fi
  done
  return 1
}

if [ "$(id -u)" -eq 0 ]; then
  load_secret SESSION_SECRET /run/secrets/session_secret
  load_secret BETTER_AUTH_SECRET /run/secrets/better_auth_secret
  load_secret AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY /run/secrets/auth_provider_token_encryption_key
  load_secret NOTIFICATION_PAYLOAD_ENCRYPTION_KEY /run/secrets/notification_payload_encryption_key
  load_secret REDIS_PASSWORD /run/secrets/redis_password
  load_secret DATABASE_URL /run/secrets/database_url
  load_secret POSTGRES_PASSWORD /run/secrets/postgres_password
  load_secret TELEGRAM_BOT_TOKEN /run/secrets/telegram_bot_token
  load_secret TELEGRAM_OIDC_CLIENT_SECRET /run/secrets/telegram_oidc_client_secret
  load_secret TELEGRAM_BOT_WEBHOOK_SECRET /run/secrets/telegram_bot_webhook_secret
  load_secret DISCORD_BOT_TOKEN /run/secrets/discord_bot_token
  load_secret DISCORD_CLIENT_SECRET /run/secrets/discord_client_secret
  load_secret DISCORD_PUBLIC_KEY /run/secrets/discord_public_key
  load_secret DISCORD_CUSTOM_ID_SECRET /run/secrets/discord_custom_id_secret
  load_secret RESEND_API_KEY /run/secrets/resend_api_key
  load_secret MAILPACE_SERVER_TOKEN /run/secrets/mailpace_server_token
  load_secret NOTIFICATION_FCM_PRIVATE_KEY /run/secrets/notification_fcm_private_key
  load_secret NOTIFICATION_APNS_PRIVATE_KEY /run/secrets/notification_apns_private_key

  exec su-exec 1000:1000 "$@"
fi

# Kubernetes injects secrets through envFrom and runs the image as UID 1000.
# A Docker secret mount, however, must be read by the root entrypoint before it
# drops privileges. Ignore unrelated projected mounts such as Kubernetes'
# service-account token, but fail closed if a declared Docker secret is present.
if has_declared_docker_secret; then
  echo "secret-entrypoint must start as root when /run/secrets is mounted" >&2
  exit 1
fi

exec "$@"
