#!/bin/sh
# Write per-deployment frontend runtime configuration.
#
# Runs from /docker-entrypoint.d/ in the nginx image (as uid 101) before nginx
# starts, so one immutable SPA image can serve many environments: flags come from
# the container environment instead of being baked in at Vite build time.
#
# Only non-secret, browser-safe values belong here — the file is public.
set -eu

TARGET="${FRONTEND_RUNTIME_CONFIG_PATH:-/usr/share/nginx/html/runtime-config.js}"

# Emit a JSON boolean when the value parses as one, otherwise omit the key so the
# build-time default keeps applying (resolveFeatureFlag falls through).
emit_flag() {
  name="$1"
  raw="$2"
  case "$(printf '%s' "${raw}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')" in
    true) printf '  "%s": true,\n' "${name}" ;;
    false) printf '  "%s": false,\n' "${name}" ;;
    *) : ;;
  esac
}

if [ ! -w "${TARGET}" ]; then
  echo "frontend-runtime-config: ${TARGET} is not writable; keeping build-time defaults" >&2
  exit 0
fi

{
  echo '// Generated at container start. Do not edit.'
  echo 'window.__APP_RUNTIME_CONFIG__ = {'
  emit_flag telegramAuthEnabled "${TELEGRAM_AUTH_ENABLED:-}"
  emit_flag discordAuthEnabled "${DISCORD_AUTH_ENABLED:-}"
  echo '};'
} >"${TARGET}"

echo "frontend-runtime-config: wrote ${TARGET}"
