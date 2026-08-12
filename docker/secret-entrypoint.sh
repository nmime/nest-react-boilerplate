#!/bin/sh
set -eu

# The one enumeration of Docker secrets, as `<secret-name>:<ENV_VAR>` in load order. It lives here
# rather than in a data file because this script runs in the runtime image, which has no JSON
# tooling; scripts/declared-secrets.mjs parses it so validators derive the list instead of copying
# it. The name is normally the lowercased variable, but two migration secrets deliberately alias
# onto the runtime variable: whichever is mounted first wins, because load_secret never overwrites.
declared_secrets="
session_secret:SESSION_SECRET
better_auth_secret:BETTER_AUTH_SECRET
auth_provider_token_encryption_key:AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY
notification_payload_encryption_key:NOTIFICATION_PAYLOAD_ENCRYPTION_KEY
redis_password:REDIS_PASSWORD
database_url:DATABASE_URL
postgres_password:POSTGRES_PASSWORD
mongodb_uri:MONGODB_URI
mongodb_migration_uri:MONGODB_URI
mongodb_password:MONGODB_PASSWORD
mongodb_migration_password:MONGODB_PASSWORD
telegram_bot_token:TELEGRAM_BOT_TOKEN
telegram_oidc_client_secret:TELEGRAM_OIDC_CLIENT_SECRET
telegram_bot_webhook_secret:TELEGRAM_BOT_WEBHOOK_SECRET
discord_bot_token:DISCORD_BOT_TOKEN
discord_client_secret:DISCORD_CLIENT_SECRET
discord_public_key:DISCORD_PUBLIC_KEY
discord_custom_id_secret:DISCORD_CUSTOM_ID_SECRET
resend_api_key:RESEND_API_KEY
mailpace_server_token:MAILPACE_SERVER_TOKEN
notification_fcm_private_key:NOTIFICATION_FCM_PRIVATE_KEY
notification_apns_private_key:NOTIFICATION_APNS_PRIVATE_KEY
"

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
  for entry in $declared_secrets; do
    if [ -f "/run/secrets/${entry%%:*}" ]; then
      return 0
    fi
  done
  return 1
}

if [ "$(id -u)" -eq 0 ]; then
  for entry in $declared_secrets; do
    load_secret "${entry#*:}" "/run/secrets/${entry%%:*}"
  done

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
