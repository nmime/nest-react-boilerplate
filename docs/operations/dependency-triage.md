# Dependency readiness failure triage

This runbook covers triage when `/ready` returns 503 or dependency health indicators report errors.
See [health checks runbook](health-checks.md) for endpoint details.

## Dependency matrix

| Dependency           | Env vars                                           | Indicator name          | Core API readiness policy         |
| -------------------- | -------------------------------------------------- | ----------------------- | --------------------------------- |
| Selected database    | `DATABASE_URL` or `MONGODB_URI`/`MONGODB_DATABASE` | `database`              | Required for durable persistence  |
| MongoDB transactions | `MONGODB_REPLICA_SET` and matching URI/topology    | `database-transactions` | Required when MongoDB is selected |
| Redis                | `REDIS_URL` or `REDIS_HOSTS`                       | `redis`                 | Optional/degraded when registered |
| NATS                 | `NATS_SERVERS`                                     | `nats`                  | Optional/degraded when registered |

## Postgres connection failure

**Symptoms:** `database` reports `error` with `required: true` while PostgreSQL
is selected; `/ready` returns 503.

1. Verify `DATABASE_URL` is set and points to a reachable host:
   ```bash
   curl -s "http://localhost:${PORT:-80}/health" | jq '.checks[] | select(.name=="database")'
   ```
2. Check Postgres is running:
   - **Local dev:** verify Docker Compose or local `pg_ctl` is running.
   - **Production:** check Postgres pod/container status and logs.
3. Verify credentials — authentication errors appear in app logs as connection refused or invalid credentials.
4. Check network — ensure the API container/pod can reach the Postgres host on the configured port.
5. If using SSL, verify `DATABASE_URL` includes `?sslmode=...` and the CA is trusted.

## MongoDB connection or transaction-topology failure

**Symptoms:** `database` or `database-transactions` reports `error` with
`required: true`; `/ready` returns 503.

1. Verify `DATABASE_ENGINE=mongodb` and `AUTH_PERSISTENCE=mongodb` agree.
2. Verify `MONGODB_URI`, `MONGODB_DATABASE`, and `MONGODB_REPLICA_SET`; the URI
   must use the same non-empty `replicaSet` value and must not enable direct or
   load-balanced mode or disable retryable writes.
3. Check that the deployment has logical sessions and a writable primary.
   Standalone MongoDB is intentionally rejected. Local/bundled one-node replica
   sets provide transactions but not HA.
4. Inspect the sanitized `reason` from `database-transactions`, such as
   `standalone_not_allowed`, `replica_set_mismatch`, `primary_unavailable`, or
   `wire_version_unsupported`.
5. For production, verify the managed/multi-node replica set, TLS trust, network
   policy, credentials, and provider status. Never paste the URI into logs.

## Redis connection failure

**Symptoms:** `redis` indicator reports `error`.

1. Verify `REDIS_URL` or the cluster/sentinel `REDIS_HOSTS` list points to a
   running Redis deployment.
2. Check Redis is accepting connections:
   ```bash
   redis-cli -h <host> -p <port> ping
   ```
3. If Redis is behind TLS, verify the URL uses `rediss://` and certificates are valid.
4. Common misconfiguration: wrong password in `REDIS_URL` or missing `--requirepass` on the server.

## NATS connection failure

**Symptoms:** `nats` indicator reports `error`.

1. Verify `NATS_SERVERS` contains the reachable NATS server URL(s).
2. Check NATS server is running and accepting connections.
3. If using authentication, verify credentials in the URL.
4. NATS is used for inter-service events; verify the `nats-server` container/pod is healthy.

## General triage steps

1. **Inspect `/ready` response** to identify the failing indicator:
   ```bash
   curl -s -w '\n%{http_code}' "http://localhost:${PORT:-80}/ready"
   ```
2. **Check app startup logs** — indicators fail at bootstrap if dependencies are unreachable.
3. **Use `/health/private`** (from a private-network IP) for the full envelope.
   Indicator details remain sanitized on every health route:
   ```bash
   curl -s "http://localhost:${PORT:-80}/health/private" | jq '.data.checks'
   ```
4. **Review environment** — verify all required env vars match the `.env.production.example` template.
5. **Network/DNS issues** — verify the dependency hostname resolves from inside the API container.
