# One-server Docker Compose production deployment

Use this path for a small single VPS deployment where one command should build
or pull the production images, run database migrations, and start all app
services behind a local reverse proxy.

The Kubernetes/Helm path remains preferred for HA production. Compose is for one
server, one Docker host, and one PostgreSQL volume.

## 1. Prepare the server

```bash
sudo apt-get update
sudo apt-get install -y git docker.io docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Clone the repository, then create local config and secret files:

```bash
git clone https://github.com/nmime/nest-react-boilerplate.git
cd nest-react-boilerplate
cp .env.production.example .env.production
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=sha-$(git rev-parse --short=12 HEAD)/" .env.production
mkdir -p docker/secrets
openssl rand -base64 48 > docker/secrets/auth_jwt_secret.txt
openssl rand -base64 32 > docker/secrets/postgres_password.txt
chmod 600 .env.production docker/secrets/*.txt
```

Edit `.env.production` for real domains, CORS origins, image registry/tag, OAuth
settings, frontend routing mode, and host ports. Do not commit `.env.production`
or `docker/secrets/`.
The example `IMAGE_TAG=sha-000000000000` is deliberately non-production; replace
it with the exact `sha-<git-sha>` tag you built, or pin images by digest in a
release-specific compose override. Never deploy `latest`, `main`, `dev`, or
other mutable tags.

## 2. Validate the compose file

```bash
docker compose --env-file .env.production -f docker/docker-compose.prod.yml config
node scripts/validate-docker-compose-prod.mjs
```

This verifies interpolation, required values, networks, volumes, health checks,
and secret file paths without starting containers. Compose fails fast when
`IMAGE_TAG` is unset, and the Node validation checks `.env.production` when that
file exists so `IMAGE_TAG` fails if it is unset, mutable, or still the
placeholder value.

## 3. Start or update with one command

Build locally from the checked-out commit:

```bash
docker compose --env-file .env.production -f docker/docker-compose.prod.yml up -d --build
```

Or pull already-published images by removing `--build`:

```bash
docker compose --env-file .env.production -f docker/docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker/docker-compose.prod.yml up -d
```

The `migrate` service waits for PostgreSQL health, reads the same secrets, and
runs `pnpm db:migrate` before the API services are allowed to start. Frontend
images default to `VITE_API_BASE_URL_MODE=same-origin` with
`FRONTEND_NGINX_CONFIG=docker/nginx-fullstack.conf`, so browser API calls route
through the colocated nginx container to Compose service DNS names
(`auth-app-api`, `user-app-api`, and `admin-app-api`) instead of exposing Docker
DNS or container ports to the browser. The same stack also runs the Vike
`site-app` Node server and the Expo `mobile-app` web export. Nginx treats
`GET`/`HEAD` requests with `Accept: text/html` as SPA navigations, so reloads of
user/admin/mobile deep links serve `index.html`; generated-client API calls keep
proxying because they request JSON.

## 4. Health checks and logs

```bash
docker compose --env-file .env.production -f docker/docker-compose.prod.yml ps
curl -fsS "http://$(docker compose --env-file .env.production -f docker/docker-compose.prod.yml port auth-app-api 80)/ready"
curl -fsS "http://$(docker compose --env-file .env.production -f docker/docker-compose.prod.yml port user-app-api 80)/ready"
curl -fsS "http://$(docker compose --env-file .env.production -f docker/docker-compose.prod.yml port admin-app-api 80)/ready"
curl -fsS "http://$(docker compose --env-file .env.production -f docker/docker-compose.prod.yml port site-app 80)/ready"
docker compose --env-file .env.production -f docker/docker-compose.prod.yml logs -f --tail=100
```

The backend Compose healthcheck and the manual API probes above intentionally
use `/ready`, which is implemented by each API and performs a PostgreSQL
readiness check when MikroORM is registered. `/health` and `/live` remain
liveness-only checks and should not replace production dependency readiness.

App services publish explicit loopback-only host ports by default. Put Caddy,
nginx, Traefik, or your cloud load balancer in front for public TLS and routing,
and confirm the assigned ports with `docker compose port <service> <port>`.

## 5. TLS and reverse proxy

Terminate TLS at the host reverse proxy and proxy to loopback ports discovered
from Compose:

- `https://landing-app.example.com` -> `docker compose ... port landing-app 8080`
- `https://site-app.example.com` -> `docker compose ... port site-app 80`
- `https://admin-app.example.com` -> `docker compose ... port admin-app 8080`
- `https://user-app.example.com` -> `docker compose ... port user-app 8080`
- `https://mobile-app.example.com` -> `docker compose ... port mobile-app 8080`
- `https://auth-app-api.example.com` -> `docker compose ... port auth-app-api 80`
- `https://user-app-api.example.com` -> `docker compose ... port user-app-api 80`
- `https://admin-app-api.example.com` -> `docker compose ... port admin-app-api 80`

The bot webhook APIs are also opt-in because they require provider credentials
and callback registration:

- `https://discord-app-api.example.com` -> `docker compose --profile discord ... port discord-app-api 80`
- `https://telegram-bot-api.example.com` -> `docker compose --profile telegram ... port telegram-bot-api 80`

Keep `CORS_ORIGINS` aligned with the public browser origins. If you intentionally
build standalone split-origin SPA images, set `FRONTEND_NGINX_CONFIG` to
`docker/nginx-spa.conf`, set `VITE_API_BASE_URL_MODE` to a non-`same-origin`
value such as `split-origin`, and provide absolute
`VITE_AUTH_API_BASE_URL`, `VITE_USER_API_BASE_URL`, and
`VITE_ADMIN_API_BASE_URL` values; keep the standalone SPA CSP connection
allow-list aligned with those explicit API origins. See
[frontend-deployment-topology.md](frontend-deployment-topology.md) for the full
mode matrix. Keep OpenAPI off or protect it behind SSO/VPN/edge auth.

## 6. Backup and restore

The bundled PostgreSQL data lives in the `postgres-data` volume. Take backups
with database-native tools from the running PostgreSQL container:

```bash
mkdir -p backups
docker compose --env-file .env.production -f docker/docker-compose.prod.yml exec -T postgres \
  sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > backups/postgres.dump
```

Validate a dump before relying on it:

```bash
cat backups/postgres.dump | docker compose --env-file .env.production -f docker/docker-compose.prod.yml exec -T postgres \
  pg_restore --list >/dev/null
```

Restore only after testing on a clone and stopping application writes:

```bash
cat backups/postgres.dump | docker compose --env-file .env.production -f docker/docker-compose.prod.yml exec -T postgres \
  sh -ec 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## 7. Rollback

1. Record the current Git SHA, immutable `IMAGE_TAG`, or pinned digest before every update.
2. Take a database backup before migrations.
3. Change `IMAGE_TAG` in `.env.production` back to the previous immutable tag.
4. Run `docker compose --env-file .env.production -f docker/docker-compose.prod.yml up -d`.
5. If the migration is not backward-compatible, restore the database backup or
   roll forward with a corrective migration.

## 8. Shutdown

```bash
docker compose --env-file .env.production -f docker/docker-compose.prod.yml down
```

The command keeps the PostgreSQL volume. Add `-v` only when intentionally wiping
data after a verified backup.

## 9. Observability (OTel, Prometheus, Alertmanager, Grafana)

The production Compose stack ships a full observability pipeline. All four
observability services are started alongside application services:

| Service          | Port                                        | Purpose                                                                                                   |
| ---------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `otel-collector` | 4317 (gRPC), 4318 (HTTP), 9464 (Prometheus) | Receives OTLP traces/metrics/logs from all backend APIs; exposes Prometheus-compatible metrics on `:9464` |
| `prometheus`     | 9090                                        | Scrapes the OTel collector, itself, Alertmanager, and Grafana; evaluates alert rules                      |
| `alertmanager`   | 9093                                        | Routes alerts to webhooks/email; supports critical/warning receivers                                      |
| `grafana`        | 3000                                        | Pre-provisioned with a Prometheus datasource and a production dashboard                                   |

### How backend APIs send telemetry

Each NestJS backend API (auth, user, admin) initializes the OpenTelemetry SDK
at startup via `bootstrap()`. The production compose sets `OTEL_ENABLED=true`
and `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318` on every backend
service. Auto-instrumentation covers HTTP, Fastify, PostgreSQL, and Redis
without any application code changes.

### Enabling/disabling observability

- To **disable** OTel export for all backends, override in `.env.production`:
  ```bash
  OTEL_ENABLED=false
  ```
- To **change** the collector endpoint (e.g. send to a remote APM):
  ```bash
  OTEL_EXPORTER_OTLP_ENDPOINT=https://your-apm.example.com/v1
  OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <token>
  ```

### Alert rules

Prometheus evaluates rules from `docker/prometheus/alert-rules.yml`. Default
alerts cover:

- Any service (collector, Prometheus, Grafana) going down for 2+ minutes (critical)
- API 5xx error rate > 5% for 5 minutes (warning)
- API p95 latency > 1s / p99 latency > 5s (warning / critical)
- Backend process memory > 85% of 512 MB (warning)
- Backend process CPU > 80% (warning)
- OTel collector memory > 80% of 1 GB (warning)

### Alertmanager routing

Edit `docker/alertmanager/alertmanager.yml` or override via environment
variables to route alerts to your Slack webhook, PagerDuty, email, or any HTTP
endpoint. The default config defines `critical-alerts` (repeat every 1h) and
`warning-alerts` (repeat every 4h) receivers with webhook hooks.

### Grafana dashboard

A production dashboard (`docker/grafana/dashboards/nest-react-boilerplate.json`)
is auto-provisioned on first start. It covers:

- Service uptime status panel
- Request rate, p95/p99 latency, and error rate per service
- Process memory and CPU per service
- OTel collector throughput (batch send rate, accepted spans)

Access Grafana at `http://localhost:3000` (login with `admin` and the password
from `docker/secrets/grafana_admin_password.txt`).
