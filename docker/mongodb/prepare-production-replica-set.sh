#!/usr/bin/env bash
set -euo pipefail

readonly host="${MONGODB_HOST:-mongodb}"
readonly replica_set="${MONGODB_REPLICA_SET:-rs0}"
readonly root_user="${MONGODB_ROOT_USER:-nrb_root}"
readonly root_password="$(tr -d '\r\n' </run/secrets/mongodb_root_password)"
readonly mongo=(mongosh --host "$host" --port 27017 --username "$root_user" --password "$root_password" --authenticationDatabase admin --quiet)

"${mongo[@]}" --eval "try { rs.status() } catch (error) { if (error.code !== 94 && error.codeName !== 'NotYetInitialized') throw error; rs.initiate({ _id: '$replica_set', members: [{ _id: 0, host: '$host:27017' }] }) }"

until "${mongo[@]}" --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)'; do
  sleep 2
done

"${mongo[@]}" --file /opt/mongodb/create-production-user.js
"${mongo[@]}" --file /opt/mongodb/transaction-smoke.js
