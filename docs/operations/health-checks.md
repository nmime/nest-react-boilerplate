# Health, readiness, and liveness runbook

Endpoints are provided by the shared `BaseHealthController` (`libs/backend/common/health`).
See [architecture docs](architecture.md) for module boundaries and [API conventions](api-conventions.md) for response envelope shapes.

## Endpoints

| Endpoint              | Method | Auth       | Purpose                                                                                                |
| --------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------ |
| `GET /live`           | GET    | None       | Process liveness — always returns 200 if the process is running.                                       |
| `GET /health`         | GET    | None       | General health with indicator details (safe subset).                                                   |
| `GET /ready`          | GET    | None       | Dependency readiness — returns 503 when required dependencies are down.                                |
| `GET /health/private` | GET    | Private IP | Full health details including unsanitized indicator details; guarded by private-network IP allow-list. |

## Expected response shapes

`/live`, `/ready`, and `/health/private` return the shared envelope:

```json
{
  "data": {
    "app": "<app-name>",
    "status": "ok" | "degraded" | "error",
    "uptime": 12345.67,
    "timestamp": "2025-01-01T00:00:00.000Z",
    "dependencies": [
      { "name": "postgres", "status": "ok", "required": true, "detail": "..." }
    ],
    "checks": [
      {
        "name": "postgres",
        "status": "ok",
        "required": true,
        "durationMs": 2,
        "details": { "message": "select 1 succeeded" }
      }
    ]
  }
}
```

`GET /health` returns the flat shape (no `data` wrapper) with the same fields.

## Status resolution

| Condition                                       | Status     | HTTP                              |
| ----------------------------------------------- | ---------- | --------------------------------- |
| All checks `ok`                                 | `ok`       | 200                               |
| Any check `degraded`, or optional check `error` | `degraded` | 200                               |
| Required check `error`                          | `error`    | 200 (`/health`) or 503 (`/ready`) |

Sensitive detail keys (e.g. `password`, `token`, `secret`, `private_key`) are always redacted to `[redacted]` in public endpoints.

## `/ready` — orchestrator probe

Kubernetes `readinessProbe`, Compose health-check, and load-balancer probes should target `/ready`.
When any required indicator fails, `/ready` returns **HTTP 503** with the failure details so orchestrators remove the pod from the pool.

## Triage: `/ready` returning 503

1. **Check which indicator failed** — inspect the `checks` array for `status: "error"` with `required: true`.
2. **Common indicators and fixes:**
   - `postgres` — database connection refused or authentication failed. Check `DATABASE_URL`, network, and Postgres logs. See [dependency readiness triage](dependency-triage.md).
   - `redis` — Redis connection refused. Check `REDIS_URL` or `CACHE_REDIS_HOST`/`CACHE_REDIS_PORT`. See [dependency readiness triage](dependency-triage.md).
   - `nats` — NATS connection refused. Check `NATS_URL` or `NATS_HOST`/`NATS_PORT`. See [dependency readiness triage](dependency-triage.md).
3. **Verify from inside the container** (if accessible):
   ```bash
   curl -s http://localhost:3000/ready | jq .
   ```
4. **Check logs** for connection errors at startup. Logs include `requestId` for correlation; see [structured logging](logging.md).
