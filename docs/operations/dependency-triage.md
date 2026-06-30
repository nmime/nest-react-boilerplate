# Dependency readiness failure triage

This runbook covers triage when `/ready` returns 503 or dependency health indicators report errors.
See [health checks runbook](health-checks.md) for endpoint details.

## Dependency matrix

| Dependency | Env vars                              | Indicator name | Required by default |
| ---------- | ------------------------------------- | -------------- | ------------------- |
| Postgres   | `DATABASE_URL`                        | `postgres`     | Yes                 |
| Redis      | `REDIS_URL` or `CACHE_REDIS_*`        | `redis`        | Yes (if registered) |
| NATS       | `NATS_URL` or `NATS_HOST`/`NATS_PORT` | `nats`         | Yes (if registered) |

## Postgres connection failure

**Symptoms:** `postgres` indicator reports `error` with `required: true`; `/ready` returns 503.

1. Verify `DATABASE_URL` is set and points to a reachable host:
   ```bash
   curl -s http://localhost:3000/health | jq '.checks[] | select(.name=="postgres")'
   ```
2. Check Postgres is running:
   - **Local dev:** verify Docker Compose or local `pg_ctl` is running.
   - **Production:** check Postgres pod/container status and logs.
3. Verify credentials — authentication errors appear in app logs as connection refused or invalid credentials.
4. Check network — ensure the API container/pod can reach the Postgres host on the configured port.
5. If using SSL, verify `DATABASE_URL` includes `?sslmode=...` and the CA is trusted.

## Redis connection failure

**Symptoms:** `redis` indicator reports `error`.

1. Verify `REDIS_URL` (or `CACHE_REDIS_HOST`/`CACHE_REDIS_PORT`) points to a running Redis instance.
2. Check Redis is accepting connections:
   ```bash
   redis-cli -h <host> -p <port> ping
   ```
3. If Redis is behind TLS, verify the URL uses `rediss://` and certificates are valid.
4. Common misconfiguration: wrong password in `REDIS_URL` or missing `--requirepass` on the server.

## NATS connection failure

**Symptoms:** `nats` indicator reports `error`.

1. Verify `NATS_URL` (or `NATS_HOST`/`NATS_PORT`) is set.
2. Check NATS server is running and accepting connections.
3. If using authentication, verify credentials in the URL.
4. NATS is used for inter-service events; verify the `nats-server` container/pod is healthy.

## General triage steps

1. **Inspect `/ready` response** to identify the failing indicator:
   ```bash
   curl -s -w '\n%{http_code}' http://localhost:3000/ready
   ```
2. **Check app startup logs** — indicators fail at bootstrap if dependencies are unreachable.
3. **Use `/health/private`** (from a private-network IP) for unsanitized details:
   ```bash
   curl -s http://localhost:3000/health/private | jq '.data.checks'
   ```
4. **Review environment** — verify all required env vars match the `.env.production.example` template.
5. **Network/DNS issues** — verify the dependency hostname resolves from inside the API container.
