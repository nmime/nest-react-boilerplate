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

is_valid_hostname() {
  host="$1"
  [ -n "${host}" ] && [ "${#host}" -le 253 ] || return 1
  case "${host}" in
    .* | *. | *..* | *[!A-Za-z0-9.-]*) return 1 ;;
  esac

  old_ifs="${IFS}"
  IFS=.
  set -- ${host}
  IFS="${old_ifs}"
  for label do
    [ "${#label}" -le 63 ] || return 1
    case "${label}" in
      '' | -* | *- | *[!A-Za-z0-9-]*) return 1 ;;
    esac
  done
}

# App destinations may be same-origin paths, credential-free HTTPS URLs, or
# exact loopback HTTP URLs for the local multi-port development stack.
# Restrict the character set so values can be emitted as JSON strings without
# an escaping tool in the minimal nginx image.
is_valid_public_url() {
  value="$1"
  case "${value}" in
    /*)
      case "${value}" in
        //* | *[!A-Za-z0-9._~/%-]*) return 1 ;;
      esac
      ;;
    https://* | http://*)
      case "${value}" in
        *[!A-Za-z0-9._~:/%-]*) return 1 ;;
      esac
      case "${value}" in
        https://*)
          protocol=https
          remainder="${value#https://}"
          ;;
        *)
          protocol=http
          remainder="${value#http://}"
          ;;
      esac
      authority="${remainder%%/*}"
      [ -n "${authority}" ] || return 1
      case "${authority}" in
        *:*)
          host="${authority%%:*}"
          port="${authority#*:}"
          case "${port}" in
            '' | *:* | *[!0-9]*) return 1 ;;
          esac
          [ "${#port}" -le 5 ] && [ "${port}" -ge 1 ] && [ "${port}" -le 65535 ] || return 1
          ;;
        *) host="${authority}" ;;
      esac
      is_valid_hostname "${host}" || return 1
      if [ "${protocol}" = http ]; then
        if [ "${host}" != localhost ] && [ "${host}" != 127.0.0.1 ]; then
          return 1
        fi
        [ "${FRONTEND_RUNTIME_ALLOW_LOOPBACK_HTTP:-false}" = true ] || return 1
      fi
      ;;
    *) return 1 ;;
  esac
}

emit_url() {
  name="$1"
  raw="$2"
  if [ -n "${raw}" ] && is_valid_public_url "${raw}"; then
    printf '  "%s": "%s",\n' "${name}" "${raw}"
  fi
}

# Free text (a product name) reaches a JavaScript string literal, and this image has no
# JSON escaping tool. Rather than escape, drop any value carrying a character that could
# end the literal or the statement; the build-time default then keeps applying.
emit_text() {
  name="$1"
  raw="$2"
  [ -n "${raw}" ] || return 0
  [ "$(printf '%s' "${raw}" | tr -d '\000-\037')" = "${raw}" ] || return 0
  case "${raw}" in
    *'"'* | *\\* | *'<'* | *'>'*) return 0 ;;
  esac
  printf '  "%s": "%s",\n' "${name}" "${raw}"
}

# A CSS colour the browser writes into <meta name="theme-color">; only the hex forms the
# brand contract documents are accepted.
emit_color() {
  name="$1"
  raw="$2"
  case "${raw}" in
    '#'[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f] | '#'[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f])
      printf '  "%s": "%s",\n' "${name}" "${raw}"
      ;;
    *) : ;;
  esac
}

# The icon type lands in a <link type="..."> attribute, so keep it to an image media type.
emit_image_media_type() {
  name="$1"
  raw="$2"
  case "${raw}" in
    image/*)
      case "${raw#image/}" in
        '' | *[!A-Za-z0-9.+-]*) return 0 ;;
      esac
      printf '  "%s": "%s",\n' "${name}" "${raw}"
      ;;
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
  emit_url userAppUrl "${LANDING_USER_APP_URL:-}"
  emit_url adminAppUrl "${LANDING_ADMIN_APP_URL:-}"
  emit_text productName "${PRODUCT_NAME:-}"
  emit_url productIconHref "${PRODUCT_ICON_HREF:-}"
  emit_image_media_type productIconType "${PRODUCT_ICON_TYPE:-}"
  emit_color productThemeColor "${PRODUCT_THEME_COLOR:-}"
  # Chrome an embedding host paints for us (the Telegram mini app). It sits outside the document,
  # so neither the stylesheet nor the runtime brand pass over <head> can reach it.
  emit_color productChromeBackgroundColor "${PRODUCT_CHROME_BACKGROUND_COLOR:-}"
  emit_color productChromeBottomBarColor "${PRODUCT_CHROME_BOTTOM_BAR_COLOR:-}"
  emit_color productChromeHeaderColor "${PRODUCT_CHROME_HEADER_COLOR:-}"
  echo '};'
} >"${TARGET}"

echo "frontend-runtime-config: wrote ${TARGET}"
