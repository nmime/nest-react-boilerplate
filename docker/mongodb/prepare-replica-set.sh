#!/usr/bin/env bash
set -euo pipefail

readonly mongodb_port="${MONGODB_PORT:-27017}"
readonly advertised_host="${MONGODB_ADVERTISED_HOST:-mongodb:${mongodb_port}}"
readonly timeout_seconds="${MONGODB_INIT_TIMEOUT_SECONDS:-120}"

if [[ ! "${mongodb_port}" =~ ^[0-9]+$ ]] || ((mongodb_port < 1 || mongodb_port > 65535)); then
  printf 'MONGODB_PORT must be an integer between 1 and 65535.\n' >&2
  exit 2
fi
if [[ ! "${timeout_seconds}" =~ ^[0-9]+$ ]] || ((timeout_seconds < 1)); then
  printf 'MONGODB_INIT_TIMEOUT_SECONDS must be a positive integer.\n' >&2
  exit 2
fi

export MONGODB_ADVERTISED_HOST="${advertised_host}"
export MONGODB_PORT="${mongodb_port}"

readonly deadline=$((SECONDS + timeout_seconds))
readonly mongo_uri="mongodb://mongodb:${mongodb_port}/admin?directConnection=true&serverSelectionTimeoutMS=2000&connectTimeoutMS=2000&socketTimeoutMS=5000"

run_before_deadline() {
  local remaining=$((deadline - SECONDS))
  if ((remaining < 1)); then
    return 124
  fi

  timeout --foreground --kill-after=2s "${remaining}s" "$@"
}

retry_before_deadline() {
  local description="$1"
  shift

  while ((SECONDS < deadline)); do
    if "$@"; then
      return 0
    fi

    local remaining=$((deadline - SECONDS))
    if ((remaining > 0)); then
      sleep "$((remaining < 2 ? remaining : 2))"
    fi
  done

  printf 'MongoDB initialization timed out after %s seconds during %s.\n' "${timeout_seconds}" "${description}" >&2
  return 1
}

prepare_replica_set() {
  run_before_deadline mongosh "${mongo_uri}" --quiet --file /opt/mongodb/init-replica-set.js
}

configure_advertised_member() {
  # mongosh evaluates the single-quoted JavaScript block.
  # shellcheck disable=SC2016
  run_before_deadline mongosh "${mongo_uri}" --quiet --eval '
    const advertisedHost = process.env.MONGODB_ADVERTISED_HOST;
    const config = rs.conf();
    if (config.members.length !== 1) {
      throw new Error(`Expected one local replica-set member, found ${config.members.length}`);
    }
    if (config.members[0].host !== advertisedHost) {
      config.members[0].host = advertisedHost;
      const result = rs.reconfig(config, { force: db.hello().isWritablePrimary !== true });
      if (!result.ok) {
        throw new Error(`Replica-set reconfiguration failed: ${JSON.stringify(result)}`);
      }
    }
  '
}

check_primary() {
  # mongosh evaluates the single-quoted JavaScript block.
  # shellcheck disable=SC2016
  run_before_deadline mongosh "${mongo_uri}" --quiet --eval '
    const config = rs.conf();
    quit(
      config.members.length === 1 &&
      config.members[0].host === process.env.MONGODB_ADVERTISED_HOST &&
      db.hello().isWritablePrimary
        ? 0
        : 1
    );
  '
}

retry_before_deadline 'replica-set preparation' prepare_replica_set
retry_before_deadline 'replica-set member reconfiguration' configure_advertised_member
retry_before_deadline 'primary readiness' check_primary

run_before_deadline mongosh "${mongo_uri}" --quiet --file /opt/mongodb/transaction-smoke.js
