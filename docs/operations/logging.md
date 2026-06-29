# Structured logging and request-id runbook

The shared logger (`libs/backend/common/logger`) produces structured JSON logs in production and pretty-printed logs in development.
See [production hardening](production-hardening.md) for security-related logging rules.

## Log format

| Environment | Format       | Controlled by                          |
|-------------|--------------|----------------------------------------|
| Development | Pretty-print | `NODE_ENV=development`                 |
| Production  | JSON lines   | `NODE_ENV=production` (or `LOG_FORMAT=json`) |

Override format explicitly with `LOG_FORMAT` or `LOGGER_FORMAT` (`json` or `pretty`).

## Log level

Set via `LOG_LEVEL`: `debug`, `info`, `warn`, `error`, `fatal`.
- **Local development:** `LOG_LEVEL=debug`
- **Production:** `LOG_LEVEL=info` (recommended minimum)

## Request ID correlation

Every HTTP request receives or preserves an `x-request-id` header:
- If the client sends `x-request-id`, the value is preserved.
- If not, a random UUID v4 is generated and returned in the response `x-request-id` header.

Each completion log line includes the `requestId` field for end-to-end correlation across:
- Request start/completion logs (method, path, status, duration)
- Application logs tied to the request context
- OpenTelemetry trace IDs (when OTel is enabled)

**See also:** [OpenTelemetry configuration](otel.md) for distributed tracing correlation.

## Log content

Completion logs include (in JSON mode):

```json
{
  "appName": "api",
  "level": "log",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "method": "GET",
  "path": "/api/users",
  "status": 200,
  "durationMs": 42
}
```

## Sensitive data redaction

The logger automatically redacts:
- Values for protected keys: `authorization`, `cookie`, `credential`, `passwd`, `password`, `private-key`, `secret`, `token`
- Bearer token patterns in headers
- API keys in query strings for protected field names

Protected keys are redacted to `[redacted]` in health endpoint details and log output.

## Triage: finding errors by request

1. **Capture the request ID** from the HTTP response header or the client's request:
   ```bash
   curl -s -D- http://localhost:3000/api/users | grep -i x-request-id
   ```
2. **Search centralized logs** by `requestId`:
   - In Grafana/Loki: `{app="api"} | json | requestId="<id>"`
   - In Datadog: `@requestId:"<id>"`
   - Grep locally: `grep '"requestId":"<id>"' /var/log/app.log`
3. **Correlate with traces** — if OTel is enabled, the trace ID appears in logs and can be looked up in Jaeger/Tempo.
