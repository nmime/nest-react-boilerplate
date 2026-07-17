#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 027

CONFIG_ROOT="${NRB_CONFIG_ROOT:-/etc/nest-react-boilerplate}"
SERVER_ENV="${CONFIG_ROOT}/server.env"

existing_value() {
  local key="$1"
  [[ -f "${SERVER_ENV}" ]] || return 0
  awk -v key="${key}" '
    $0 ~ "^" key "=" {
      sub("^" key "=", "");
      gsub(/^\047|\047$/, "");
      gsub(/^\042|\042$/, "");
      print;
      exit;
    }
  ' "${SERVER_ENV}"
}

APP_ROOT="${APP_ROOT:-$(existing_value APP_ROOT)}"
APP_ROOT="${APP_ROOT:-/opt/nest-react-boilerplate}"
REPOSITORY_URL="${REPOSITORY_URL:-$(existing_value REPOSITORY_URL)}"
REPOSITORY_URL="${REPOSITORY_URL:-https://github.com/nmime/nest-react-boilerplate.git}"
REPOSITORY_BRANCH="${REPOSITORY_BRANCH:-$(existing_value REPOSITORY_BRANCH)}"
REPOSITORY_BRANCH="${REPOSITORY_BRANCH:-main}"

[[ "${EUID}" -eq 0 ]] || { printf 'bootstrap must run as root (use sudo)\n' >&2; exit 1; }
[[ "${CONFIG_ROOT}" =~ ^/[A-Za-z0-9._/-]+$ ]] || { printf 'NRB_CONFIG_ROOT must be an absolute path without spaces\n' >&2; exit 1; }
[[ "${APP_ROOT}" =~ ^/[A-Za-z0-9._/-]+$ ]] || { printf 'APP_ROOT must be an absolute path without spaces\n' >&2; exit 1; }
[[ "${CONFIG_ROOT}" != '/' && "${CONFIG_ROOT}" != '/etc' ]] || { printf 'NRB_CONFIG_ROOT must be a dedicated subdirectory\n' >&2; exit 1; }
[[ "${APP_ROOT}" != '/' && "${APP_ROOT}" != '/opt' && "${APP_ROOT}" != '/srv' ]] || { printf 'APP_ROOT must be a dedicated subdirectory\n' >&2; exit 1; }
[[ "${REPOSITORY_BRANCH}" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] || { printf 'REPOSITORY_BRANCH is invalid\n' >&2; exit 1; }
command -v apt-get >/dev/null 2>&1 || { printf 'bootstrap supports Ubuntu and Debian\n' >&2; exit 1; }

upsert_environment_value() {
  local file="$1" key="$2" value="$3" temporary
  temporary="$(mktemp "${file}.XXXXXX")"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { found = 0 }
    $0 ~ "^" key "=" { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "${file}" >"${temporary}"
  chmod --reference="${file}" "${temporary}"
  chown --reference="${file}" "${temporary}"
  mv -f "${temporary}" "${file}"
}

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates git openssl

if [[ -d "${APP_ROOT}/.git" ]]; then
  [[ -z "$(git -c safe.directory="${APP_ROOT}" -C "${APP_ROOT}" status --porcelain)" ]] || {
    printf 'existing checkout is dirty; refusing to overwrite %s\n' "${APP_ROOT}" >&2
    exit 1
  }
  git -c safe.directory="${APP_ROOT}" -C "${APP_ROOT}" fetch --prune origin
  git -c safe.directory="${APP_ROOT}" -C "${APP_ROOT}" checkout "${REPOSITORY_BRANCH}"
  git -c safe.directory="${APP_ROOT}" -C "${APP_ROOT}" merge --ff-only "origin/${REPOSITORY_BRANCH}"
elif [[ -e "${APP_ROOT}" && -n "$(find "${APP_ROOT}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  printf 'APP_ROOT exists and is not an empty repository: %s\n' "${APP_ROOT}" >&2
  exit 1
else
  mkdir -p "$(dirname "${APP_ROOT}")"
  git clone --branch "${REPOSITORY_BRANCH}" --single-branch "${REPOSITORY_URL}" "${APP_ROOT}"
fi

server_environment_existed=false
[[ ! -f "${SERVER_ENV}" ]] || server_environment_existed=true
NRB_CONFIG_ROOT="${CONFIG_ROOT}" "${APP_ROOT}/deploy/single-server/serverctl" init
if [[ "${server_environment_existed}" == 'false' ]]; then
  upsert_environment_value "${SERVER_ENV}" APP_ROOT "${APP_ROOT}"
  upsert_environment_value "${SERVER_ENV}" REPOSITORY_URL "${REPOSITORY_URL}"
  upsert_environment_value "${SERVER_ENV}" REPOSITORY_BRANCH "${REPOSITORY_BRANCH}"
fi
NRB_CONFIG_ROOT="${CONFIG_ROOT}" "${APP_ROOT}/deploy/single-server/serverctl" provision

cat <<EOF
Bootstrap completed without deploying placeholder configuration.

1. Edit ${CONFIG_ROOT}/server.env.
2. Edit ${CONFIG_ROOT}/.env.production and its secret files.
3. Create the documented DNS records.
4. Run: sudo /usr/local/sbin/nrb-server apply

Rerunning this bootstrap is safe: it fast-forwards a clean checkout and
converges already-installed prerequisites instead of recreating configuration.
EOF
