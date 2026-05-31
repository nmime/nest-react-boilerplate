# Observability, backup, and disaster-recovery runbook

This runbook defines the production SRE baseline for `nest-react-boilerplate`.
The Helm chart ships all resources behind toggles so local/dev installs remain
small while production can enable telemetry, Prometheus alerts, dashboards, and
scheduled PostgreSQL backups.

## SLO, RPO, and RTO targets

| Area                  | Target                                                               | Evidence                                                     |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| API availability      | 99.9% monthly for auth/user/admin APIs                               | Prometheus alerts and Grafana dashboard                      |
| API latency           | p95 < 1s for backend HTTP requests over 5 minutes                    | OTLP HTTP metrics exported through the collector             |
| Backup RPO            | <= 60 minutes in production                                          | `postgres-backup` CronJob schedule and freshness alert       |
| Restore RTO           | <= 60 minutes for database-only restore, <= 4 hours full environment | Quarterly restore drill record                               |
| Restore drill cadence | Quarterly and before major data-model releases                       | `pnpm run db:restore:drill` output attached to change record |

## Helm enablement

Production values should enable the monitoring stack after the Prometheus
Operator CRDs are installed:

```yaml
monitoring:
  enabled: true
  otel:
    enabled: true
  otelCollector:
    enabled: true
  serviceMonitor:
    enabled: true
  prometheusRule:
    enabled: true
  grafanaDashboard:
    enabled: true
```

The application already initializes OpenTelemetry from environment variables.
When `monitoring.otel.enabled=true`, the chart writes `OTEL_ENABLED=true` and,
by default, points `OTEL_EXPORTER_OTLP_ENDPOINT` at the in-cluster collector:

```text
http://<release>-otel-collector:4318
```

Override `monitoring.otel.endpoint` to send directly to an external OTLP
collector. Use `monitoring.otelCollector.config` to add tail-sampling, remote
trace exporters, or vendor-specific auth headers. Keep secrets (for example
`OTEL_EXPORTER_OTLP_HEADERS`) in an external Secret rather than plaintext values
when they contain credentials.

## Alerts

The chart renders a `PrometheusRule` when
`monitoring.prometheusRule.enabled=true`. Default alerts cover:

- no ready replicas for any deployed API/frontend component;
- high pod restart rate;
- OTLP collector scrape outage;
- stale backup CronJob schedule beyond the RPO window;
- failed backup jobs.

Page alerts should route to the primary on-call. Warning alerts should route to
the service Slack/Teams channel. Tune severities and thresholds per environment.

## Dashboards

The chart can provision `.helm/dashboards/nest-react-boilerplate.json` as a
Grafana sidecar ConfigMap when `monitoring.grafanaDashboard.enabled=true`. The
dashboard includes replica health, OTLP request rate, OTLP p95 latency, and
backup freshness panels. Add environment-specific variables in Grafana after
import if your metric labels differ.

## PostgreSQL backups

Backups are opt-in:

```yaml
backups:
  enabled: true
  schedule: "17 * * * *" # hourly => <= 60 minute RPO
  destination:
    objectStore:
      enabled: true
      existingSecret: nest-react-boilerplate-backup-object-store
      bucket: my-prod-backups
      prefix: nest-react-boilerplate/postgres
  encryption:
    enabled: true
    existingSecret: nest-react-boilerplate-backup-encryption
    command: 'age -r "$AGE_RECIPIENT" -o "$BACKUP_FILE.age" "$BACKUP_FILE" && rm -f "$BACKUP_FILE" && BACKUP_FILE="$BACKUP_FILE.age"'
  hooks:
    upload: 'aws s3 cp "$BACKUP_FILE" "s3://$BACKUP_BUCKET/$BACKUP_PREFIX/$(basename "$BACKUP_FILE")" --only-show-errors'
  retention:
    keepLast: 336 # two weeks of hourly local copies when a PVC is mounted
```

The default image is `postgres:16-alpine`, which contains `pg_dump` but not
cloud CLIs or encryption tools. For production, set `backups.image` to a hardened
ops image that includes the selected upload/encryption tools (`aws`, `age`,
`gpg`, `rclone`, etc.). The CronJob exports these hook variables:

- `BACKUP_FILE` - path to the dump produced by `pg_dump`;
- `BACKUP_BUCKET` and `BACKUP_PREFIX` - object-store destination values;
- `DATABASE_URL` - loaded from the application Secret;
- any keys from `backups.destination.objectStore.existingSecret` and
  `backups.encryption.existingSecret`.

If `backups.destination.pvc.enabled=false`, the pod uses `emptyDir`; in that
mode you **must** configure an upload hook or backups disappear when the pod is
removed. Enable a PVC only for local buffering; object storage remains the
source of truth for DR.

## Restore procedure

1. Declare an incident and freeze destructive writes if possible.
2. Identify the restore point that satisfies the incident RPO.
3. Provision or select the target PostgreSQL instance.
4. Download and decrypt the backup artifact.
5. Run a dry-run command first:

   ```bash
   DATABASE_URL=postgres://... pnpm run db:restore -- --input ./postgres.dump --dry-run --force
   ```

6. Restore after approval:

   ```bash
   DATABASE_URL=postgres://... pnpm run db:restore -- --input ./postgres.dump --yes --force
   ```

7. Run migrations if the restored backup predates the currently deployed app.
8. Verify `/ready` for all APIs, smoke-test auth/login, and monitor error rate
   for at least 30 minutes.
9. Record actual RPO/RTO and attach logs to the incident review.

## Restore drill / CI-safe check

Use the CI-safe dry-run to validate that the backup/restore contract, CLI wiring,
and paths still work without requiring a live database or `pg_dump` binaries:

```bash
pnpm run db:restore:drill -- --ci --dry-run
```

For a real local drill against a disposable database:

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/nest_react_boilerplate_dr \
  pnpm run db:restore:drill -- --output test-results/dr/postgres.dump --yes
```

Never run a non-dry-run restore against production without an approved incident
or change ticket.
