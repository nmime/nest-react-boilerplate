# Developer observability with Grafana, Loki, and Tempo

The optional local stack in `docker-compose.override.yml` provides logs and
traces alongside explicitly selected PostgreSQL or MongoDB development services.
It does not start applications. Production monitoring uses the separate
[production Compose topology](docker-compose-production.md) and Helm values.

## Start and inspect

```bash
# Observability only; every published port binds to loopback.
docker compose --profile observability up -d --wait

# Add one development database, matching pnpm nrb setup.
docker compose --profile observability --profile postgres up -d --wait
# Or use --profile mongodb instead of --profile postgres.

docker compose --profile observability ps
curl --fail http://localhost:3000/api/health
curl --fail http://localhost:3100/ready
curl --fail http://localhost:3200/ready
```

Grafana's container health check probes all three HTTP readiness endpoints.
Loki and Tempo use distroless images and have no shell or `wget` to execute
container-local shell probes. The three immutable image pins are owned by
`scripts/delivery-inventory.mjs`; changing a pin requires parser and ingestion
validation, including the major-version configuration migration.

## Access and authority

Open [Grafana](http://localhost:3000). Anonymous access has the **Viewer** role,
basic authentication and the login form are disabled, and a fresh instance
creates no initial administrator. This scratch stack supports querying, without
anonymous dashboard or datasource administration. It provisions only `loki` and
`tempo` from `docker/grafana/local-datasources.yml`.

This configuration does not remove an administrator from an existing database.
Use the production secret-backed authenticated configuration for a persistent,
shared, or externally reachable installation.

## Send telemetry explicitly

The backend SDK uses OTLP over HTTP. For a host-native development process:

```dotenv
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
```

A process on the Compose network uses
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://tempo:4318/v1/traces`. Tempo also
listens on gRPC port 4317 for other clients. Configure metrics through a metrics
collector separately; Tempo is a trace backend. Service names are code-owned
bootstrap identities, not an `OTEL_SERVICE_NAME` override.

Loki listens on port 3100 and accepts its push API. Application stdout does not
reach Loki automatically: configure an explicit log sender before claiming log
ingestion. Availability, trace/log ingestion, and application instrumentation are
separate checks. `pnpm run test:local-observability` uses an isolated project to
prove readiness, owned trace/log round trips, Grafana datasource queries, and
denial of anonymous dashboard writes.

## Stop

```bash
docker compose --profile observability stop grafana loki tempo
```

Root `docker compose down -v` also removes selected development database volumes.
Use it only when those databases are disposable and their data is no longer
needed. Observability data in this scratch topology is ephemeral.
