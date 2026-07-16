# Production deployment with Docker Compose

Docker Compose is the supported single-host production path. It has one common
application file and exactly one required database overlay:

| Mode                        | Files                                                             | PostgreSQL ownership                                  |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Bundled PostgreSQL          | `docker-compose.prod.yml` + `docker-compose.prod.bundled-db.yml`  | Compose service and persistent `postgres-data` volume |
| External/managed PostgreSQL | `docker-compose.prod.yml` + `docker-compose.prod.external-db.yml` | Operator/cloud provider; no Compose DB service/volume |

Do not run `docker/docker-compose.prod.yml` alone. The base file deliberately
does not choose a database topology. Both overlays run the same migration
container before APIs and keep all application image/build contracts identical.

Kubernetes/Helm remains the preferred HA path. Compose is for one Docker host;
the bundled database mode is not an HA database architecture.

## 1. Initialize and prepare the host

Initialize a fresh template before deploying so registry names, domains, and
database names belong to the product:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm nrb init --name "Acme" --domain acme.example --owner acme-org
```

Install a current Docker Engine with the Compose plugin, then create local
configuration and secret directories:

```bash
cp .env.production.example .env.production
mkdir -p docker/secrets
chmod 700 docker/secrets
openssl rand -base64 48 > docker/secrets/auth_jwt_secret.txt
openssl rand -base64 48 > docker/secrets/better_auth_secret.txt
openssl rand -base64 32 > docker/secrets/grafana_admin_password.txt
chmod 600 .env.production docker/secrets/*.txt
```

Edit `.env.production` for real domains, CORS origins, frontend routing, registry,
ports, and optional integrations. Replace `IMAGE_TAG=sha-000000000000` with the
full immutable tag produced by the release workflow:

```text
IMAGE_TAG=sha-0123456789abcdef0123456789abcdef01234567
```

Never deploy `latest`, `main`, `dev`, `prod`, or another mutable tag.

## 2. Choose exactly one database mode

### Bundled PostgreSQL

Create the password file used by both the PostgreSQL container and application
migration/API containers:

```bash
openssl rand -base64 32 > docker/secrets/postgres_password.txt
chmod 600 docker/secrets/postgres_password.txt
pnpm run docker:prod:bundled-db:config
```

The rendered model must contain `postgres`, `postgres-data`, and
`postgres_password`. PostgreSQL is reachable only on the internal Compose
database network and is not published to the host.

The production migrator and API image entrypoint reads root-owned `0600` secret
files before immediately dropping to the unprivileged `node` user. Application
and migration processes never run as root, including on native Linux hosts.

### External or managed PostgreSQL

Write the complete TLS-enabled connection URL to a Docker secret file. Do not put
credentials in `.env.production`, Compose YAML, command history, or Git:

```bash
install -m 600 /dev/null docker/secrets/database_url.txt
# Edit docker/secrets/database_url.txt with your secret manager or editor.
pnpm run docker:prod:external-db:config
```

The file contains one connection URL, for example the provider-issued
`postgresql://...` value. Percent-encode special characters in user/password
segments and enable certificate verification according to the provider contract.

The rendered external model contains no `postgres` service, no `postgres-data`
volume, and no `postgres_password` secret. Only the `database_url` secret is
mounted into migrations and APIs. The migration service uses the egress-capable
application network so it can reach the managed endpoint.

## 3. Validate both topology contracts

Run the repository preflight even if only one mode will be deployed:

```bash
pnpm run deploy:validate:docker
node scripts/validate-docker-compose-prod.mjs
node scripts/validate-compose-modes.mjs
```

CI renders both merged Compose models and asserts that their service, volume,
secret, dependency, and network contracts differ exactly as documented.

## 4. Start or update

Bundled database:

```bash
pnpm run docker:prod:bundled-db:up
```

External database:

```bash
pnpm run docker:prod:external-db:up
```

The scripts use published immutable images by default. Add `--build` to the
equivalent explicit `docker compose` command only when intentionally building on
the server from the checked-out commit. Prefer CI-built, scanned, signed images.

For the optional Telegram bot API, append `--profile telegram` to the explicit
Compose command. To enable Telegram OIDC/TMA on `auth-app-api`, also create
`docker/secrets/telegram_bot_token.txt` and
`docker/secrets/telegram_oidc_client_secret.txt`, set
`TELEGRAM_OIDC_CLIENT_ID`, `VITE_TELEGRAM_AUTH_ENABLED=true`,
`BETTER_AUTH_URL`, and `BETTER_AUTH_TRUSTED_ORIGINS`, then append the auth
overlay:

```bash
docker compose --env-file .env.production \
  -f docker/docker-compose.prod.yml \
  -f docker/docker-compose.prod.bundled-db.yml \
  -f docker/docker-compose.prod.telegram.yml up -d
```

Use the external database overlay in place of the bundled one when applicable.
The default same-origin Compose topology sets
`BETTER_AUTH_URL=https://user-app.example.com`, so Telegram's registered
callback must be
`https://user-app.example.com/api/auth/oauth2/callback/telegram`, with the
initialized product domain substituted. A split-origin build instead sets both
`BETTER_AUTH_URL` and `VITE_AUTH_API_BASE_URL` to
`https://auth-app-api.example.com` and registers that host. Do not mix the two
hosts inside one flow because Better Auth state/session cookies are host-scoped.
Discord provider secrets and callback setup are likewise required before its
profile is enabled.

## 5. Inspect health and logs

Use the same two files as the selected mode. Bundled example:

```bash
docker compose --env-file .env.production \
  -f docker/docker-compose.prod.yml \
  -f docker/docker-compose.prod.bundled-db.yml ps
docker compose --env-file .env.production \
  -f docker/docker-compose.prod.yml \
  -f docker/docker-compose.prod.bundled-db.yml logs --tail=100 migrate auth-app-api user-app-api admin-app-api
```

For external mode, replace the bundled overlay with
`docker/docker-compose.prod.external-db.yml`.

Production API and Vike site health checks use `/ready`; static frontends use
`/nginx-health`. `/ready` fails closed when required dependencies or migrations
are unavailable. App ports bind to loopback by default; terminate public TLS at
Caddy, nginx, Traefik, or a cloud load balancer.

Default domain routing after initialization is:

- apex -> selected `landing-app` or `site-app`;
- every other frontend -> `<app-id>.<base-domain>`;
- every API -> `<api-id>.<base-domain>`;
- optional bot webhook APIs -> their exact app-id domains when enabled.

Keep `CORS_ORIGINS`, provider callback URLs, certificates, and reverse-proxy
routes aligned with those product-owned hostnames.

## 6. Backups

For bundled mode, dump from the Compose PostgreSQL service to a host-owned path:

```bash
mkdir -p backups
docker compose --env-file .env.production \
  -f docker/docker-compose.prod.yml \
  -f docker/docker-compose.prod.bundled-db.yml exec -T postgres \
  sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > backups/postgres.dump
```

Validate restore procedures on an isolated copy before relying on a dump. For
external mode, use provider-native automated backups/PITR and a separately tested
restore runbook. The application Compose project intentionally does not pretend
to own a managed database's lifecycle.

## 7. Rollback

1. Record the current Git SHA and immutable image tag before every update.
2. Take or verify a database backup before migrations.
3. Change `IMAGE_TAG` back to a previously verified full SHA tag.
4. Run the selected mode's `:up` script.
5. Restore the database only when a migration is not backward-compatible;
   otherwise roll forward with a corrective migration.

## 8. Shutdown

Bundled mode:

```bash
pnpm run docker:prod:bundled-db:down
```

External mode:

```bash
pnpm run docker:prod:external-db:down
```

Bundled shutdown keeps `postgres-data`. Never add `-v` unless intentionally
destroying local state after verifying a backup. External shutdown never acts on
the managed database.

## 9. Observability

The base production model includes OpenTelemetry Collector, Prometheus,
Alertmanager, and Grafana. Backends export OTLP to the colocated collector by
default. Their host ports are loopback-only. Configure Grafana through
`grafana_admin_password`, route Alertmanager to real receivers, protect operator
surfaces behind SSO/VPN, and move durable telemetry to platform-managed storage
when single-host retention is insufficient.
