# Observability with Grafana Stack

This project ships a local observability stack powered by **Grafana**, **Loki** (logs), and **Tempo** (traces). The stack is defined in `docker-compose.override.yml`, which is automatically merged with the base `docker-compose.yml` when you run `docker compose`.

## Quick Start

```bash
# Start the full stack (apps + observability)
docker compose up

# Or start only the observability services
docker compose up grafana loki tempo
```

## Accessing Grafana

- **URL**: http://localhost:3000
- **Authentication**: Anonymous access is enabled — just open the URL, no login required.

## OTLP Endpoints (for traces)

Tempo exposes OTLP receivers on the following endpoints:

| Protocol | Endpoint              |
| -------- | --------------------- |
| gRPC     | http://localhost:4317 |
| HTTP     | http://localhost:4318 |

## Connecting Applications

To send traces from your application to Tempo, set the OpenTelemetry exporter endpoint:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4317
```

This is the **Docker-internal** hostname. When running outside of Docker (e.g., local dev process), use `http://localhost:4317` instead.

### Environment Variables

| Variable                      | Value               | Description                          |
| ----------------------------- | ------------------- | ------------------------------------ |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://tempo:4317` | OTLP gRPC endpoint (Docker-internal) |

Service names are code-owned bootstrap identities, not an
`OTEL_SERVICE_NAME` environment override. This prevents one shared environment
value from collapsing distinct app telemetry into the same service.

### Example (NestJS with the OTel lib)

The project includes `libs/backend/common/otel/lib` for OpenTelemetry setup. After setting `OTEL_EXPORTER_OTLP_ENDPOINT`, traces from instrumented NestJS applications are automatically sent to Tempo and viewable in Grafana.

## Available Data Sources

Once Grafana is running, two data sources are auto-provisioned:

| Name  | Type  | URL               | Purpose            |
| ----- | ----- | ----------------- | ------------------ |
| Loki  | Loki  | http://loki:3100  | Log aggregation    |
| Tempo | Tempo | http://tempo:3200 | Distributed traces |

Tempo is linked to Loki via **Traces to Logs** — clicking a span in Tempo navigates to the corresponding logs in Loki, filtered by trace ID.

## Architecture

```
┌─────────────┐     OTLP      ┌──────────┐
│  NestJS App │ ────────────► │  Tempo   │ :4317 (gRPC)
│  (in Docker)│               │  :3200   │ :4318 (HTTP)
└─────────────┘               └────┬─────┘
                                   │
┌─────────────┐     Logs          ┌────┴─────┐
│  NestJS App │ ────────────────► │  Loki    │ :3100
│  (via stdout│   (Loki native)   │          │
└─────────────┘                   └────┬─────┘
                                       │
                    ┌──────────────────┘
                    ▼
              ┌──────────┐
              │ Grafana  │ :3000
              │  (UI)    │
              └──────────┘
```

## Stopping and Cleaning Up

```bash
# Stop all services
docker compose down

# Stop and remove volumes
docker compose down -v
```
