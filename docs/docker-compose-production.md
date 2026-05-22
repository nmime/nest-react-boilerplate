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
mkdir -p docker/secrets
openssl rand -base64 48 > docker/secrets/auth_jwt_secret.txt
openssl rand -base64 32 > docker/secrets/postgres_password.txt
chmod 600 .env.production docker/secrets/*.txt
```

Edit `.env.production` for real domains, CORS origins, image registry/tag, OAuth
settings, and host ports. Do not commit `.env.production` or `docker/secrets/`.

## 2. Validate the compose file

```bash
docker compose --env-file .env.production -f docker/docker-compose.prod.yml config
```

This verifies interpolation, required values, networks, volumes, health checks,
and secret file paths without starting containers.

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
runs `pnpm db:migrate` before the API services are allowed to start.

## 4. Health checks and logs

```bash
docker compose --env-file .env.production -f docker/docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:${AUTH_APP_API_PORT:-3003}/ready
curl -fsS http://127.0.0.1:${USER_APP_API_PORT:-3002}/ready
curl -fsS http://127.0.0.1:${ADMIN_APP_API_PORT:-3001}/ready
docker compose --env-file .env.production -f docker/docker-compose.prod.yml logs -f --tail=100
```

Frontends are bound to loopback (`127.0.0.1`) by default. Put Caddy, nginx,
Traefik, or your cloud load balancer in front for public TLS and routing.

## 5. TLS and reverse proxy

Terminate TLS at the host reverse proxy and proxy to loopback ports:

- `https://example.com` -> `127.0.0.1:${LANDING_APP_PORT:-8080}`
- `https://admin.example.com` -> `127.0.0.1:${ADMIN_APP_PORT:-8081}`
- `https://app.example.com` -> `127.0.0.1:${USER_APP_PORT:-8082}`
- `https://auth.example.com` -> `127.0.0.1:${AUTH_APP_API_PORT:-3003}`
- `https://api.example.com` -> `127.0.0.1:${USER_APP_API_PORT:-3002}`
- `https://admin-api.example.com` -> `127.0.0.1:${ADMIN_APP_API_PORT:-3001}`

Keep `CORS_ORIGINS` aligned with the public browser origins. Keep the standalone
SPA CSP connection allow-list aligned with the explicit API origins above when
building with absolute `VITE_AUTH_API_BASE_URL`, `VITE_USER_API_BASE_URL`, or
`VITE_ADMIN_API_BASE_URL`. Keep OpenAPI off or protect it behind SSO/VPN/edge
auth.

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

1. Record the current Git SHA and `IMAGE_TAG` before every update.
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
