#!/usr/bin/env bash
set -euo pipefail

install -o mongodb -g mongodb -m 0400 /run/secrets/mongodb_root_password /tmp/mongodb-root-password
install -o mongodb -g mongodb -m 0400 /run/secrets/mongodb_keyfile /tmp/mongodb-keyfile
export MONGO_INITDB_ROOT_PASSWORD_FILE=/tmp/mongodb-root-password

exec /usr/local/bin/docker-entrypoint.sh mongod \
  --auth \
  --bind_ip_all \
  --keyFile /tmp/mongodb-keyfile \
  --replSet "${MONGODB_REPLICA_SET:-rs0}"
