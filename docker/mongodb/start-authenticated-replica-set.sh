#!/usr/bin/env bash
set -euo pipefail

install -o mongodb -g mongodb -m 0400 /run/secrets/mongodb_keyfile /tmp/mongodb-keyfile

exec /usr/local/bin/docker-entrypoint.sh mongod \
  --auth \
  --bind_ip_all \
  --keyFile /tmp/mongodb-keyfile \
  --replSet "${MONGODB_REPLICA_SET:-rs0}"
