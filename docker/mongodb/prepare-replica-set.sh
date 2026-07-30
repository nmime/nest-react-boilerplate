#!/usr/bin/env bash
set -euo pipefail

readonly mongo_uri='mongodb://mongodb:27017/admin?directConnection=true'

until mongosh "$mongo_uri" --quiet --file /opt/mongodb/init-replica-set.js; do
  sleep 2
done

until mongosh "$mongo_uri" --quiet --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)'; do
  sleep 2
done

mongosh "$mongo_uri" --quiet --file /opt/mongodb/transaction-smoke.js
