# Monitoring and Alerting

Runtime monitoring, alerting, and uptime strategy for the Nest React Boilerplate platform.

## Request ID (CLS)

All monitoring data is correlated by `requestId` — generated once per request by `ClsInterceptor` via Node `AsyncLocalStorage`. Every log line, error response, and trace carries the same `requestId`.

**Find all events for one request:**

```bash
# Local
grep '"requestId":"550e8400-e29b-41d4-a716-446655440000"' /var/log/app.log

# Grafana/Loki
{app="api"} | json | requestId="550e8400-e29b-41d4-a716-446655440000"

# Datadog
@requestId:"550e8400-e29b-41d4-a716-446655440000"
```

The client can set `x-request-id` in the request header; the server preserves it in CLS and echoes it back in the response header.

## Prometheus metrics endpoint

Each NestJS backend service exposes an `/metrics` endpoint (HTTP GET, no auth by default — place behind your ingress/auth gateway). Metrics are emitted in OpenMetrics/Prometheus text format.

| Service            | Endpoint                        |
| ------------------ | ------------------------------- |
| `admin-app-api`    | `http://localhost:3001/metrics` |
| `user-app-api`     | `http://localhost:3002/metrics` |
| `auth-app-api`     | `http://localhost:3003/metrics` |
| `discord-app-api`  | `http://localhost:3007/metrics` |
| `telegram-bot-api` | `http://localhost:3013/metrics` |

**How it works:** The shared bootstrap layer (`libs/backend/common`) registers an `express-prom` / `prom-client` middleware that collects HTTP request duration histograms, request/response sizes, active request counters, and application-level gauges (DB pool, queue depth). OpenTelemetry SDK (`@opentelemetry/sdk-node`) instruments the HTTP server layer and exports metrics via OTLP when `OTEL_ENABLED=true`.

### Enabling OTel metrics

```env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_METRIC_EXPORT_INTERVAL=60000
```

With the collector running, metrics are forwarded to Prometheus (or any OTLP-compatible backend) alongside traces and logs.

## Prometheus scrape configuration

Add each service to your `prometheus.yml` `scrape_configs`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'nrb-backend'
    metrics_path: '/metrics'
    static_configs:
      - targets:
          - 'admin-app-api:3001'
          - 'user-app-api:3002'
          - 'auth-app-api:3003'
          - 'discord-app-api:3007'
          - 'telegram-bot-api:3013'
    relabel_configs:
      - source_labels: [__address__]
        regex: '(.+):(.+)'
        target_label: 'instance'
        replacement: '${1}'
      - target_label: 'job'
        replacement: 'nrb-backend'

  # Optional: frontend health scrapes (if Vite/Expo expose /health or /live)
  - job_name: 'nrb-frontend'
    metrics_path: '/health'
    static_configs:
      - targets:
          - 'admin-app:4200'
          - 'user-app:4201'
    metrics_relabel_configs:
      - source_labels: [__name__]
        regex: 'up'
        action: keep
```

## Alerting rules examples

Save as `alerts.yml` and include in Prometheus config:

```yaml
groups:
  - name: nrb-backend
    rules:
      # --- High error rate ---
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{job="nrb-backend",status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total{job="nrb-backend"}[5m]))
          > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: 'High error rate on {{ $labels.job }} ({{ $value | humanizePercentage }})'
          description: 'More than 5% of requests returned 5xx in the last 5 minutes.'

      # --- High p99 latency ---
      - alert: HighLatencyP99
        expr: |
          histogram_quantile(0.99,
            sum(rate(http_request_duration_seconds_bucket{job="nrb-backend"}[5m]))
            by (le, service))
          > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'High p99 latency on {{ $labels.service }} ({{ $value }}s)'
          description: 'p99 request latency has exceeded 2 seconds for 5 minutes.'

      # --- Service down ---
      - alert: ServiceDown
        expr: up{job="nrb-backend"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: 'Service {{ $labels.instance }} is down'
          description: '{{ $labels.instance }} has been unreachable for 2 minutes.'

      # --- DB connection pool exhaustion ---
      - alert: DBPoolExhausted
        expr: db_pool_active_connections / db_pool_max_connections > 0.9
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: 'DB connection pool near exhaustion on {{ $labels.instance }}'
          description: '{{ $value | humanizePercentage }} of DB connections are in use.'

      # --- NATS queue depth ---
      - alert: QueueDepthHigh
        expr: nats_queue_depth > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'NATS queue depth high on {{ $labels.instance }}'
          description: 'Queue depth has exceeded 1000 messages for 5 minutes.'
```

## Dead Man's Switch (DeadMan's Snitch)

Use DeadMan's Snitch as a watchdog to ensure your monitoring pipeline itself is alive. If Prometheus stops scraping or Alertmanager stops firing, no alerts go out — the dead man's switch catches this blind spot.

### Integration

1. Register a snitch at [deadmanssnitch.com](https://deadmanssnitch.com) and get your snitch URL.
2. Add a Prometheus rule that POSTs to the snitch on every evaluation cycle:

```yaml
- name: deadmanssnitch
  rules:
    - alert: DeadMansSwitch
      expr: vector(1)
      for: 0m
      labels:
        severity: none
      annotations:
        snitch_url: 'https://deadmanssnitch.com/api/v3/snitches/YOUR_SNITCH_UUID'
```

3. In Alertmanager, route `DeadMansSwitch` to a webhook receiver that POSTs to the snitch URL:

```yaml
receivers:
  - name: 'deadmanssnitch'
    webhook_configs:
      - url: 'https://deadmanssnitch.com/api/v3/snitches/YOUR_SNITCH_UUID'
        send_resolved: false

route:
  receiver: deadmanssnitch
  matchers:
    - alertname = DeadMansSwitch
```

**Alternative:** use a cron job or CI workflow that `curl`s the snitch URL every 15 minutes.

## Uptime monitoring recommendations

For external uptime checks (outside your own Prometheus), use a third-party monitor that hits your public health endpoints.

| Provider            | What to use it for                               | Free tier         |
| ------------------- | ------------------------------------------------ | ----------------- |
| **BetterStack**     | HTTP uptime + synthetic checks + log aggregation | 3 monitors free   |
| **healthchecks.io** | Cron-job / worker heartbeat monitoring           | 20 checks free    |
| **UptimeRobot**     | Basic HTTP/SOCK/DNS uptime pings                 | 50 monitors free  |
| **Pingdom**         | Synthetic browser checks + global pings          | 1 monitor (trial) |

### Recommended configuration

```
Endpoint: https://user-app-api.example.com/health
Method:   GET
Expected: HTTP 200, body contains "ok"
Interval: 60s
Regions:  US-East, EU-West, APAC
Notify:   Slack #ops-alerts + PagerDuty
```

For the Telegram bot worker, register a heartbeat with healthchecks.io — the worker emits a POST to the healthcheck URL on each successful cycle.

## Key metrics to track

| Metric                          | Type      | Labels                        | Why it matters                    | SLO / Threshold          |
| ------------------------------- | --------- | ----------------------------- | --------------------------------- | ------------------------ |
| `http_request_rate`             | Counter   | `service`, `method`, `status` | Traffic volume, capacity planning | —                        |
| `http_error_rate`               | Gauge     | `service`, `status`           | User-facing failures              | < 1% 5m avg              |
| `http_request_duration_p50`     | Histogram | `service`, `method`, `route`  | Median user experience            | < 200ms                  |
| `http_request_duration_p99`     | Histogram | `service`, `method`, `route`  | Tail latency, p99 SLA             | < 2s                     |
| `db_pool_active_connections`    | Gauge     | `instance`                    | DB saturation, connection leaks   | < 80% of max             |
| `db_pool_idle_connections`      | Gauge     | `instance`                    | Over-provisioned connections      | —                        |
| `nats_queue_depth`              | Gauge     | `queue_name`, `instance`      | Message backlog, consumer lag     | < 1000                   |
| `process_resident_memory_bytes` | Gauge     | `instance`                    | Memory leaks, OOM risk            | < 70% of container limit |
| `process_cpu_seconds_total`     | Counter   | `instance`                    | CPU saturation                    | < 80% sustained          |
| `up`                            | Gauge     | `instance`, `job`             | Service availability              | == 1                     |
| `nodejs_active_handles`         | Gauge     | `instance`                    | Event loop stall risk             | < 100 sustained          |
| `telegram_polling_errors`       | Counter   | `instance`                    | Bot connectivity issues           | < 1/min                  |
| `discord_interaction_failures`  | Counter   | `instance`                    | User-facing bot failures          | < 0.5% of total          |
