# Production deployment with Docker Compose

Docker Compose is the supported production path for one Docker host. The
repository owns the complete application stack, an optional PostgreSQL or
MongoDB service, and an optional Caddy public edge. Kubernetes/Helm remains the
preferred HA path; neither bundled database topology is HA.

The supported topology is selected in `.env.production`, then the repository
wrapper assembles the correct overlays. Do not run
`docker/docker-compose.prod.yml` alone.

## Topology dimensions

### Database engine and ownership

The fresh setup closure selects the mutually exclusive durable provider.
`DATABASE_ENGINE`, when set, must match it.
`COMPOSE_DATABASE_MODE=bundled-db|external-db` independently selects who owns
it, yielding four durable combinations. Leave both variables empty for a
provider-free frontend closure; the wrapper then omits every database overlay,
migrator, and backend workload.

| Engine/ownership    | Overlay                                       | Contract                                                  |
| ------------------- | --------------------------------------------- | --------------------------------------------------------- |
| PostgreSQL bundled  | `docker-compose.prod.bundled-db.yml`          | Compose service and persistent `postgres-data` volume     |
| PostgreSQL external | `docker-compose.prod.external-db.yml`         | Operator/cloud URL from `DATABASE_URL_FILE`               |
| MongoDB bundled     | `docker-compose.prod.mongodb-bundled-db.yml`  | One-node replica set and persistent `mongodb-data` volume |
| MongoDB external    | `docker-compose.prod.mongodb-external-db.yml` | Operator replica-set URI from `MONGODB_URI_FILE`          |

Bundled MongoDB's one member enables transactions but provides no database HA.
Production should use a managed or operator-owned multi-node replica set.
Standalone MongoDB is rejected.

### Public domain ownership

| `COMPOSE_DOMAIN_MODE` | Public behavior                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `single-domain`       | The Compose Caddy edge publishes one hostname. It routes core APIs by path and sends all remaining requests to the selected `landing-app` or `site-app`. Other frontend containers stay loopback-only. |
| `per-app-domains`     | The Compose Caddy edge publishes every frontend and API on its deterministic app-ID hostname. The selected landing/site app owns the apex. This is the full multi-app topology.                        |
| `external-proxy`      | Compose publishes no edge. Every app/API port remains loopback-only for an operator-owned reverse proxy or load balancer.                                                                              |

`single-domain` deliberately means one public frontend, not multiple SPAs hidden
under invented path prefixes. Vite, Astro, Vike, and Expo assets have different
base-path contracts; pretending they share one path namespace would produce a
deployment that breaks after navigation or asset loading. Use
`per-app-domains` when admin, user, mobile-web, site, and landing must all be
public.

Optional Telegram and Discord profiles require `per-app-domains` when Compose
owns the edge. Their user-facing app and API/webhook endpoints must both be
reachable. An `external-proxy` deployment may provide an equivalent operator-
owned routing contract.

### TLS ownership

| `COMPOSE_TLS_MODE` | Valid with                         | Behavior                                                                  |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------- |
| `automatic`        | `single-domain`, `per-app-domains` | Caddy obtains and renews certificates for the exact configured hostnames. |
| `provided`         | `single-domain`, `per-app-domains` | Caddy loads the operator-provided certificate and key.                    |
| `external`         | `external-proxy`                   | TLS is terminated outside this Compose project.                           |

Automatic HTTPS works with individual DNS records or a wildcard DNS record that
points all subdomains to the host. Caddy still issues exact-host certificates.
If policy requires one actual wildcard certificate, use `provided`; the
certificate must cover the apex plus every configured subdomain, commonly with
both apex and wildcard SANs. Caddy's standard image intentionally avoids a
provider-specific DNS plugin.

## 1. Initialize the product

Initialize a fresh template before deploying so registry names, domains, and
database names belong to the product:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm nrb init --name "Acme" --domain acme.example --owner acme-org --apex-app landing-app
```

`--apex-app` accepts exactly `landing-app` or `site-app`. The initializer updates
`PRIMARY_APP` and every documented hostname together.

Scaffold the environment file and secret storage. The recommended way is the
init helper, which copies `.env.production` from the example, generates every
locally-generatable secret (`0600`), and creates empty placeholder files for the
externally-issued ones (`DATABASE_URL`, provider tokens, push keys) for you to
fill. It is idempotent — existing secret files are never overwritten:

```bash
pnpm docker:prod:init                    # bundled-db by default
pnpm docker:prod:init --database=external-db --profile=telegram,discord
```

Manual equivalent (must cover every secret the base stack mounts — note
`notification_payload_encryption_key` and, for `bundled-db`, `postgres_password`):

```bash
cp .env.production.example .env.production
mkdir -p docker/secrets && chmod 700 docker/secrets
for s in session_secret better_auth_secret; do openssl rand -base64 48 > "docker/secrets/$s.txt"; done
for s in auth_provider_token_encryption_key notification_payload_encryption_key \
         redis_password grafana_admin_password postgres_password; do
  openssl rand -base64 32 > "docker/secrets/$s.txt"
done
chmod 600 .env.production docker/secrets/*.txt
```

Replace `IMAGE_TAG=sha-000000000000` with the full-SHA tag produced by the
release workflow. Protect that tag from mutation or use the documented digest
override when immutable identity is required:

```text
IMAGE_TAG=sha-0123456789abcdef0123456789abcdef01234567
```

Never deploy `latest`, `main`, `dev`, `prod`, or another mutable tag.

## 2. Configure domains

The only hostname inputs are:

```dotenv
PUBLIC_DOMAIN=example.com
PRIMARY_APP=landing-app
COMPOSE_DOMAIN_MODE=per-app-domains
```

Do not include a scheme, port, path, or `*.` wildcard in `PUBLIC_DOMAIN`. The
wrapper validates it and derives the complete mapping documented in the
[Project Catalog](project-catalog.md). Optional bot hosts are included only
when their application profiles are enabled.

Any publicly served app may own the apex. With `PRIMARY_APP=site-app`, the site
owns it and landing moves to its app-ID subdomain; with `PRIMARY_APP=user-app`,
the product SPA is the front door. Other hostnames do not change either way. In
particular, an app called `auth-app-api` always keeps its exact app ID in the
hostname, never a starter or generic name.

The edge modes derive `CORS_ORIGINS`, `BETTER_AUTH_URL`,
`BETTER_AUTH_TRUSTED_ORIGINS`, `AUTH_ALLOWED_RETURN_URLS`, Telegram webhook URLs,
bot web-app URLs, and the landing page's user/admin destinations from this
mapping. Per-app mode emits the derived HTTPS app origins into the landing
container's public runtime config; single-domain mode emits same-origin `/app`
and `/admin` paths. Add exceptional origins through
`CORS_EXTRA_ORIGINS` and `BETTER_AUTH_EXTRA_TRUSTED_ORIGINS`. External-proxy mode
can derive the same contract when `EXTERNAL_PROXY_PUBLIC_MODE` is set to
`single-domain` or `per-app-domains`; without it, compatibility mode requires
the operator to set the complete values explicitly.

### DNS choices

For per-app domains, use either:

- explicit A/AAAA records for the apex and every enabled app hostname; or
- apex A/AAAA records plus wildcard DNS such as `*.example.com` pointing to the
  same Docker host.

Wildcard DNS controls address resolution; it does not enable unknown Caddy
hosts. Setup writes `.nrb/Caddyfile.per-app-domains` and
`.nrb/Caddyfile.single-domain` from the closure, and the
wrapper mounts it as the per-app edge configuration. Caddy therefore serves
only selected core app hostnames plus explicitly selected optional routes.

## 3. Configure the public edge

The default full multi-app setup is:

```dotenv
COMPOSE_DOMAIN_MODE=per-app-domains
COMPOSE_TLS_MODE=automatic
EDGE_BIND_ADDRESS=0.0.0.0
EDGE_HTTP_PORT=80
EDGE_HTTPS_PORT=443
```

Caddy owns TCP 80, TCP 443, and UDP 443 (HTTP/3). Application, API,
observability, and database ports are not exposed publicly. Change the bind
address or published ports when a host firewall, upstream load balancer, or
port-forwarding layer requires it.

For one public hostname:

```dotenv
COMPOSE_DOMAIN_MODE=single-domain
COMPOSE_TLS_MODE=automatic
```

For an existing reverse proxy:

```dotenv
COMPOSE_DOMAIN_MODE=external-proxy
COMPOSE_TLS_MODE=external
EXTERNAL_PROXY_PUBLIC_MODE=per-app-domains
```

In external-proxy mode, route only to the documented loopback ports and keep
API/navigation matching equivalent to `docker/nginx-fullstack.conf`.
For the supported turnkey host Nginx + Certbot implementation, use
[single-server-deployment.md](single-server-deployment.md) instead of creating a
second hand-maintained proxy map.

### Operator-provided or wildcard certificate

Set:

```dotenv
COMPOSE_TLS_MODE=provided
EDGE_TLS_CERT_FILE=./secrets/tls.crt
EDGE_TLS_KEY_FILE=./secrets/tls.key
```

Copy the PEM certificate chain and unencrypted PEM private key into
`docker/secrets/`, then restrict access:

```bash
chmod 600 docker/secrets/tls.crt docker/secrets/tls.key
```

The files are mounted read-only and never copied into an image. Certificate
issuance and renewal remain the operator's responsibility in this mode.

## 4. Choose the database

Set both dimensions explicitly:

```dotenv
DATABASE_ENGINE=postgres
COMPOSE_DATABASE_MODE=bundled-db
```

### Bundled PostgreSQL

```dotenv
COMPOSE_DATABASE_MODE=bundled-db
```

Create the password file used by PostgreSQL, migrations, and API containers:

```bash
openssl rand -base64 32 > docker/secrets/postgres_password.txt
chmod 600 docker/secrets/postgres_password.txt
```

PostgreSQL is reachable only on the internal Compose database network.

### External PostgreSQL

```dotenv
COMPOSE_DATABASE_MODE=external-db
```

Write the complete provider-issued TLS connection URL to a Docker secret file:

```bash
install -m 600 /dev/null docker/secrets/database_url.txt
# Edit docker/secrets/database_url.txt with your secret manager or editor.
```

Do not put database credentials in `.env.production`, Compose YAML, shell
history, or Git. The external model contains no PostgreSQL service or volume.

### Bundled MongoDB

```dotenv
DATABASE_ENGINE=mongodb
COMPOSE_DATABASE_MODE=bundled-db
MONGODB_DATABASE=nest_react_boilerplate
MONGODB_REPLICA_SET=rs0
```

Create independent root, runtime, migration, and backup/restore passwords plus
the internal replica-set keyfile:

```bash
openssl rand -base64 32 > docker/secrets/mongodb_root_password.txt
openssl rand -base64 32 > docker/secrets/mongodb_password.txt
openssl rand -base64 32 > docker/secrets/mongodb_migration_password.txt
openssl rand -base64 32 > docker/secrets/mongodb_backup_restore_password.txt
openssl rand -base64 64 > docker/secrets/mongodb_keyfile.txt
chmod 600 docker/secrets/mongodb_*.txt
```

The preparation service initializes the replica set and three non-root
principals idempotently before the provider-aware migrator. Runtime receives
`readWrite` on the application database, migration receives `readWrite` plus
`dbAdmin` there, and backup/restore receives the built-in `backup` and `restore`
roles from `admin`. Because MongoDB requires it for `--oplogReplay`, that last
principal alone also receives the custom `nrbOplogRestore` role with `anyAction`
on `anyResource`. This is a transaction-capable single-node topology, not HA.
Set `MONGODB_DATABASE_TOOLS_DOCKER_NETWORK=nest-react-boilerplate_database`
when using the pinned Docker backup/restore tools. The CLI derives a
deployment-wide internal URI from the backup/restore user and password file;
the database remains unpublished on the host.

### External MongoDB

```dotenv
DATABASE_ENGINE=mongodb
COMPOSE_DATABASE_MODE=external-db
MONGODB_URI_FILE=./secrets/mongodb_uri.txt
MONGODB_REPLICA_SET=prod-rs
```

Install the provider-issued URI into `docker/secrets/mongodb_uri.txt`. It must
use `mongodb://` or `mongodb+srv://`, include a non-empty `replicaSet` option,
and match `MONGODB_REPLICA_SET`. Use a managed or multi-node replica set with a
writable primary and logical sessions; do not point this mode at a standalone.
Create `mongodb_migration_uri.txt` for a separate application-database
migration principal and `mongodb_backup_restore_uri.txt` for a principal with
the built-in `backup` and `restore` roles. The backup/restore URI must be
deployment-wide (no database path), include `authSource=admin`, and use the same
`replicaSet` option. Oplog replay additionally requires a provider-supported
custom role with `anyAction` on `anyResource`; grant it only to this dedicated
principal. Runtime containers never mount either elevated URI.

## 5. Enable optional applications and notification runtimes

Select optional applications through `pnpm nrb setup`; the closure already
contains their required apps and capabilities. `COMPOSE_PROFILES` can name only
the same selected optional profiles and cannot add an unselected workload:

```dotenv
COMPOSE_PROFILES=notification-consumer,notification-scheduler
# COMPOSE_PROFILES=notification-consumer,notification-scheduler,telegram
# COMPOSE_PROFILES=discord,notification-consumer,notification-scheduler,telegram
```

Create `docker/secrets/notification_payload_encryption_key.txt` for both
runtimes. Configure the selected scheduler provider secrets only: Resend,
MailPace, Telegram, Discord, FCM, and/or APNs. Static CSV audiences additionally
require production S3 settings because the API stores the bounded upload object
for asynchronous consumer validation.

The wrapper derives the matching Compose profiles from the closure and only then imports their
Caddy host/routes. Disabled optional domains do not trigger certificate
issuance. For Telegram, also create the bot/OIDC/webhook secret files and set
`TELEGRAM_OIDC_CLIENT_ID` and `VITE_TELEGRAM_AUTH_ENABLED=true`. The standard
per-app callback is:

```text
https://user-app.example.com/api/auth/oauth2/callback/telegram
```

The TMA URL is `https://user-app.example.com/telegram-mini-app` and the webhook
is `https://telegram-bot-api.example.com/telegram/webhook`. The wrapper derives
both from `PUBLIC_DOMAIN`.

For Discord, create `docker/secrets/discord_client_secret.txt`,
`docker/secrets/discord_bot_token.txt`, and
`docker/secrets/discord_public_key.txt`, set `DISCORD_CLIENT_ID` and
`DISCORD_APPLICATION_ID`, then keep the derived callback and interactions URL
registered in the Discord application. The wrapper adds
`docker/docker-compose.prod.discord.yml`, enables Discord auth, mounts the OAuth
client secret, starts the bot API profile, and publishes only
`discord-app-api.example.com`.

## 6. Validate before deployment

Validate every database/domain/TLS/profile contract, the generated hostnames,
both Caddyfiles, and the merged Compose models:

```bash
pnpm run deploy:validate:docker
pnpm run test:scripts
pnpm run docker:prod:config:check
pnpm run docker:prod:config
```

The last command uses `.env.production`. It should render exactly one engine and
ownership pair and, unless `external-proxy` is selected, exactly one `edge`
service.

Ownership-specific render commands remain available and use the selected
`DATABASE_ENGINE`. Pass the ownership axis directly to render one without
editing `.env.production`:

```bash
pnpm run docker:prod:config --database=bundled-db
pnpm run docker:prod:config --database=external-db
```

The validator also checks the explicit auth overlays
`docker/docker-compose.prod.telegram.yml` and
`docker/docker-compose.prod.discord.yml`.

## 7. Start, inspect, update, and stop

Production Compose is image-only by default. The wrapper validates the fresh
closure, pulls only its selected application images and infrastructure, and
starts them with the immutable `IMAGE_TAG` and `--no-build`; a
host update therefore does not compile the Nx workspace or require a local
dependency installation. Pull first when the host has not yet fetched the
release:

```bash
pnpm run docker:prod:pull
```

Start the selected topology:

```bash
pnpm run docker:prod:up
```

Inspect it without reconstructing overlay lists manually:

```bash
pnpm run docker:prod:ps
pnpm run docker:prod:logs -- --tail=100 migrate edge auth-app-api user-app-api admin-app-api
```

Explicit service names are accepted only when they belong to the current
closure-selected topology; positional names and options such as `--scale`
cannot add an unselected service.

Update by changing only to another verified full-SHA `IMAGE_TAG`, pulling the
release, rendering the model again, and rerunning `pnpm run docker:prod:up`.

An explicit local source build remains available for development, break-glass
recovery, or validating a checkout before publishing images. It is never part
of the normal deployment path:

```bash
pnpm run docker:prod:build
# Equivalent: pnpm run docker:prod:up -- --source-build
```

The Docker dependency layer is keyed by the setup-selected package manifest,
workspace policy, and lock under `.nrb/closure/`. Source builds fail closed when
the closure is missing, stale, or does not own the requested release image. A
fresh checkout must explicitly select the product and materialize its lock
before building:

```bash
pnpm nrb setup --replace --app <catalog-id> --non-interactive
pnpm nrb closure install
pnpm run docker:prod:build
```

The production source-build overlay declares `nrb-closure` as an explicit
additional BuildKit context for every service that builds `Dockerfile`. The
wrapper validates freshness and supplies only the normalized `.nrb/closure`
path. Setting the context to `.`, omitting it, or pointing it at an arbitrary
directory cannot substitute the root workspace manifests.

Backend and Vike runtime stages copy only the selected runtime's transitive
built outputs into an isolated deployment directory; they do not copy the full
workspace `dist` tree. The migrator likewise installs only the selected
database provider's dependency set.

Stop containers while preserving all volumes:

```bash
pnpm run docker:prod:down
```

Never add `-v` unless intentionally destroying state after verifying a backup.

## 8. Backups and rollback

The canonical commands dispatch to the selected provider and redact connection
strings:

```bash
pnpm db:backup -- --output backups/pre-release.dump
pnpm db:restore -- --input backups/pre-release.dump --dry-run
pnpm db:restore:drill -- --ci --dry-run
```

PostgreSQL creates custom-format dumps. MongoDB creates gzip archives; the
deployment-wide path uses oplog capture/replay for replica-set consistency. For
bundled PostgreSQL, a direct host-owned dump remains available:

```bash
mkdir -p backups
docker compose --env-file .env.production \
  -f docker/docker-compose.prod.yml \
  -f docker/docker-compose.prod.bundled-db.yml exec -T postgres \
  sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > backups/postgres.dump
```

Validate restores on an isolated copy. For either external provider, use
provider-native automated backups/PITR and a separately tested restore runbook.
MongoDB production backup/restore commands read
`MONGODB_BACKUP_RESTORE_URI` or `MONGODB_BACKUP_RESTORE_URI_FILE`; using this
dedicated deployment-wide URI selects `mongodump --oplog` and
`mongorestore --oplogReplay`. The application-scoped `MONGODB_URI` fallback is
kept only for database-scoped local archives and does not capture an oplog.

Rollback procedure:

1. Record the current Git SHA and image tag before every update.
2. Verify a current database backup before migrations.
3. Change `IMAGE_TAG` to a previously verified full SHA tag.
4. Run `pnpm run docker:prod:config`, then `pnpm run docker:prod:up`.
5. Restore the database only for a non-backward-compatible migration; otherwise
   roll forward with a corrective migration.

## 9. Security and observability

The Caddy container uses a read-only root filesystem, drops all capabilities
except low-port binding, prevents privilege escalation, and persists only its
data/config volumes. Never publish application loopback ports as a shortcut.
Every production service uses bounded `json-file` rotation; tune
`DOCKER_LOG_MAX_SIZE` and `DOCKER_LOG_MAX_FILES` for host capacity instead of
allowing container logs to consume the disk.

The base model retains reference observability service definitions, but product
commands target only closure-selected application and capability services.
Platform-owned observability remains a separate explicit deployment decision.
