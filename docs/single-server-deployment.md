# Idempotent single-server deployment

This is the supported turnkey path for one Ubuntu or Debian host. It installs
and operates host Nginx + Certbot in front of the application, which stays in
`external-proxy` mode so every application and API port is bound only to
`127.0.0.1`; the host firewall exposes only SSH, HTTP, and HTTPS.

## Runtimes

`RUNTIME_MODE` in `server.env` decides what the host actually runs. Everything
else in this document — Nginx, Certbot, DNS modes, secret handling, loopback
binds, the rerun guarantees — is shared by both.

| `RUNTIME_MODE`      | What runs                                                                   | Image/artifact source                                                                                  |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `compose` (default) | Docker Compose services under `nest-react-boilerplate.service`              | `COMPOSE_IMAGE_SOURCE=registry` pulls immutable `sha-<git-sha>` tags; `local` builds them on this host |
| `native`            | PM2-supervised Node processes, host PostgreSQL/Redis, SPAs served from disk | built from the checkout on every deploy                                                                |

Select it at bootstrap time:

```bash
curl -fsSL <raw-url>/deploy/single-server/bootstrap.sh | sudo bash -s -- --runtime native --domain acme.example --email ops@acme.example --apply
```

A native host installs no Docker, and its deployment user is deliberately not in
the `docker` group. `--registry`/`--image-tag` are rejected there rather than
silently ignored, because there are no images.

The controller is rerunnable. Existing configuration and secrets are never
overwritten, already-correct Node.js and Docker installations are retained, apt
packages are converged, certificates are reused while valid, and code updates are
fast-forward-only.

Use Kubernetes/Helm instead when the product needs multiple application nodes,
HA databases, rolling traffic across hosts, or GitOps reconciliation. This
runbook is deliberately for one server.

## Fresh server bootstrap

Prerequisites:

- Ubuntu or Debian on x86-64 or arm64;
- root/sudo access;
- TCP 22 (or the configured SSH port), 80, and 443 reachable;
- DNS prepared as described below;
- a `sha-<full-git-sha>` image set in the configured registry, with recorded
  digests or registry immutability policy where immutable identity is required.

Run from a checked-out repository:

```bash
sudo deploy/single-server/bootstrap.sh
```

For a truly empty host, download the reviewed bootstrap from the same Git SHA
you intend to operate, inspect it, then run it. Do not pipe an unreviewed moving
branch directly into a root shell.

The bootstrap installs only the minimum needed to clone, checks out
`/opt/nest-react-boilerplate`, runs `init`, and converges host prerequisites. It
does not deploy the placeholder `example.com` configuration.

Repository and location may be selected without editing the script:

```bash
sudo env \
  NRB_CONFIG_ROOT=/etc/acme-platform \
  APP_ROOT=/opt/acme-platform \
  REPOSITORY_URL=https://github.com/acme/platform.git \
  REPOSITORY_BRANCH=main \
  deploy/single-server/bootstrap.sh
```

The installed `nrb-server` wrapper persists the selected config and application
roots, so later commands do not require repeating those environment variables.

After bootstrap, edit the root-readable files:

```text
/etc/nest-react-boilerplate/server.env
/etc/nest-react-boilerplate/.env.production
/etc/nest-react-boilerplate/secrets/*
```

Then apply the complete state:

```bash
sudo nrb-server apply
```

`apply` runs provision again, validates configuration and secret permissions,
renders a temporary HTTP-only ACME endpoint when a certificate is not yet
available, starts the Compose stack, obtains or validates the certificate,
atomically tests and installs HTTPS Nginx configuration, and checks every
public host through `127.0.0.1` with normal TLS hostname validation.

## Configuration contract

`server.env` owns the host lifecycle:

| Setting                            | Meaning                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `RUNTIME_MODE`                     | `compose` (default) or `native`; see [Runtimes](#runtimes)                                  |
| `NODE_VERSION`                     | Exact Node.js 24 release; official archive checksum is checked                              |
| `PNPM_VERSION`                     | Exact repository pnpm version activated through Corepack                                    |
| `PM2_VERSION`                      | Exact PM2 release, installed for `RUNTIME_MODE=native` only                                 |
| `APP_ROOT`                         | Clean deployment checkout                                                                   |
| `STATE_ROOT`                       | Last/previous successful image tag, or commit in native mode                                |
| `DEPLOY_USER`                      | Unprivileged owner of Git, pnpm, and the runtime; only a member of `docker` in compose mode |
| `CERTIFICATE_MODE`                 | `exact-hosts`, `dns-wildcard`, or `existing`                                                |
| `ENABLE_UFW` / `SSH_PORT`          | Optional firewall convergence without assuming port 22                                      |
| `ENABLE_UNATTENDED_UPGRADES`       | Debian security-update service                                                              |
| `HEALTHCHECK_RETRIES` and interval | Bounded post-deploy HTTPS retry policy                                                      |
| `NGINX_CLIENT_MAX_BODY_SIZE`       | Positive edge request limit in Nginx size syntax                                            |

`.env.production` remains the complete application/runtime source of truth.
Start from `.env.production.example`; `nrb-server init` does this without
overwriting an existing file. The single-host invariants are:

```dotenv
COMPOSE_DOMAIN_MODE=external-proxy
COMPOSE_TLS_MODE=external
EXTERNAL_PROXY_PUBLIC_MODE=per-app-domains
TRUST_PROXY=true
VITE_API_BASE_URL_MODE=same-origin
```

Choose either `single-domain` or `per-app-domains` for
`EXTERNAL_PROXY_PUBLIC_MODE`. Choose `landing-app` or `site-app` for
`PRIMARY_APP`. Set the real `PUBLIC_DOMAIN`, registry, verified full-SHA image tag,
database mode, and optional profiles.

The Compose wrapper derives CORS, Better Auth trusted origins/base URL, OAuth
callbacks, Discord interactions, Telegram webhook, and Telegram Mini App URL
from that public mode. Do not duplicate or hand-maintain a second URL map in
Nginx.

Every secret that can be created locally is generated independently with
OpenSSL: the session secret, Better Auth state/cookie material, the 32-byte
provider-token encryption key, Redis and bundled PostgreSQL
passwords, the Grafana administrator password, and the Telegram webhook
verification secret. They are created once, never overwritten on reruns, owned
by root, and converged to mode `0640` for the deployment user's protected
primary group. This gives the unprivileged Compose process read access without
making secrets world-readable.

Credentials issued by another system cannot be generated locally. Protected
empty files are created for the external database URL, Telegram bot/OIDC
credentials, and Discord bot/OAuth/public-key values; enabling the relevant
mode or profile fails validation until the operator installs the real values.
The same external-input boundary applies to registry login and Certbot DNS
provider credentials. The controller never prints secret contents.

Authenticate the deployment user to a private registry once, using a
least-privilege pull token supplied without putting it in shell history:

```bash
sudo -u nrb docker login ghcr.io --username YOUR_USER --password-stdin
```

## DNS and certificate modes

### One public domain

Set:

```dotenv
PUBLIC_DOMAIN=example.com
PRIMARY_APP=landing-app
EXTERNAL_PROXY_PUBLIC_MODE=single-domain
```

Create an A record, and an AAAA record only when the host actually has working
public IPv6, for `example.com`. Nginx serves the selected landing/site app and
routes canonical API, Better Auth/OAuth, Telegram, and Discord paths on the same
origin. Other frontend containers remain private.

### Exact app domains, with explicit or wildcard DNS

Set `EXTERNAL_PROXY_PUBLIC_MODE=per-app-domains`. The exact public contract is:

The selected landing/site application owns the apex. Every other enabled
deployable uses the exact mapping in the
[Project Catalog](project-catalog.md), with the configured base domain
substituted for `example.com`.

Create all exact A/AAAA records, or create apex A/AAAA plus
`*.example.com` pointing to the same server. Wildcard DNS is only a DNS
shortcut: Nginx still accepts exactly the enabled app-ID hosts and never serves
arbitrary subdomains.

### Certificate choice

- `CERTIFICATE_MODE=exact-hosts` is the default. Certbot uses HTTP-01 webroot
  validation on port 80 and requests one SAN certificate containing exactly the
  enabled public hosts. It works with either explicit records or wildcard DNS.
- `CERTIFICATE_MODE=dns-wildcard` requests `example.com` plus
  `*.example.com`. Configure a supported credential-file DNS plugin, its Debian
  package, a root-readable credentials file, and propagation time. The script
  installs the package and uses DNS-01, which is required for wildcard
  certificates.
- `CERTIFICATE_MODE=existing` never issues or renews. The operator-managed
  certificate must exist at
  `/etc/letsencrypt/live/<CERTIFICATE_NAME>/{fullchain,privkey}.pem`, cover all
  required names, and remain valid for at least seven days.

For Cloudflare, for example:

```dotenv
CERTIFICATE_MODE=dns-wildcard
CERTIFICATE_NAME=example.com
CERTBOT_DNS_PLUGIN=cloudflare
CERTBOT_DNS_PACKAGE=python3-certbot-dns-cloudflare
CERTBOT_DNS_CREDENTIALS=/etc/letsencrypt/cloudflare.ini
CERTBOT_DNS_PROPAGATION_SECONDS=60
```

Use a scoped DNS token, not a global API key. `certbot.timer` is enabled and a
deploy hook validates then reloads Nginx. `sudo nrb-server renew` provides an
immediate operator-run renewal check.

## Reverse-proxy behavior

Nginx is generated from the same public topology as Compose. It provides:

- HTTP ACME challenge and HTTPS redirect;
- TLS 1.2/1.3, HSTS, secure baseline headers, and WebSocket forwarding;
- original host, scheme, client address, and a proxy-generated request ID;
- `/api/auth`, OAuth, auth docs/callbacks, profile, and admin API routing;
- browser navigation fallback to each owning frontend;
- Telegram webhook/Mini App and Discord interaction routes only when enabled;
- exact virtual hosts, an explicit unknown-host rejection vhost, and
  loopback-only upstreams;
- `/_infra/health` for local deployment verification.

Application ports `3001`, `3002`, `3003`, optional `3007`/`3013`, and frontend
ports `4200` through `4300` remain bound to `127.0.0.1` by Compose. Observability
ports are also loopback-only. Docker `json-file` logs are size/file bounded by
`DOCKER_LOG_MAX_SIZE` and `DOCKER_LOG_MAX_FILES`. Do not add public firewall
rules for private ports.

## Safe reruns and updates

All mutation commands take an exclusive host lock. Read-only inspection remains
available while another operation is running:

```bash
sudo nrb-server provision
sudo nrb-server deploy
sudo nrb-server doctor
sudo nrb-server status
sudo nrb-server logs
sudo nrb-server logs auth-app-api
```

`provision` is safe to rerun after changing pinned runtime versions. It uses the
official Docker apt repository only when Docker is absent; an existing
operator-managed Docker installation is preserved. Official `docker-ce`
packages are upgraded to the current stable apt candidate on later runs. Node
is downloaded for x64/arm64 from `nodejs.org`, checked against the release
SHA-256 manifest, and installed only when the configured exact version differs.
`init`, `apply`, `deploy`, `update`, and `rollback` also converge any newly
introduced machine-generatable secret without rotating an existing file.

For an application update, first verify the CI-built full-SHA image set and a
current database backup, then run:

```bash
sudo nrb-server update --image-tag sha-0123456789abcdef0123456789abcdef01234567
```

Add `--system` to converge OS/runtime packages in the same maintenance window.
The update aborts on a dirty checkout, fetches and prunes the configured remote,
checks out the configured branch, permits only a fast-forward, pulls the pinned
immutable images, records the previous tag, and deploys with `--no-build`.
Because the deployed artifact is a prebuilt image, in compose runtime mode the
update **does not run `pnpm install`** or compile the workspace on the server,
and it does not guess an image tag from `main`: a release/docs commit may not
have produced images.

`RUNTIME_MODE=native` inverts exactly that one property. It has no prebuilt
artifact, so every update installs dependencies and builds on the host, then
publishes the built SPAs into `FRONTEND_DIST_ROOT`, migrates, and reloads PM2.
Everything else — dirty-checkout refusal, fast-forward-only, secret handling,
Nginx, Certbot — is identical.

At boot, `nest-react-boilerplate.service` reruns the same production Compose
wrapper after Docker and network readiness. Containers also use restart
policies. On a native host that unit is absent; `pm2-<DEPLOY_USER>.service`
resurrects the saved process list instead. Nginx and Certbot timers are
independently enabled in both runtimes.

## Rollback boundary

The controller records the last and previous successfully healthy immutable
tags only after Compose and HTTPS checks pass. If a new deployment fails, the
last healthy tag remains the immediate rollback target. A rollback is explicit:

```bash
sudo nrb-server rollback --yes
```

This changes application images only. It never reverses or destroys database
migrations. `--yes` confirms that the deployed schema changes are backward
compatible. If they are not, stop and follow the database restore/forward-fix
runbook instead. Automatic destructive database rollback is intentionally not
implemented.

**`RUNTIME_MODE=native` has no automatic rollback, by design.** A rollback there
would have to rebuild from source, and a failed rebuild (out of memory, registry
outage, a lockfile the older commit cannot install) would leave the host with
neither the old nor the new build while PM2 holds open files from it — strictly
worse than the compose path, which can always re-pull an immutable tag. The
controller still records `current-commit`/`previous-commit` under `STATE_ROOT`
and `nrb-server rollback` prints the exact manual sequence:

```bash
sudo -u nrb git -C /opt/nest-react-boilerplate checkout --detach <previous-commit>
sudo nrb-server deploy
```

Migrations are never re-run on that path. Retained per-commit release trees are
the prerequisite for making it automatic; until then the refusal is deliberate.

Before every release:

1. verify backup/PITR and an actual restore drill;
2. verify the exact image tag exists for every enabled service;
3. run `pnpm run deploy:validate:docker` in the reviewed checkout;
4. deploy and keep `nrb-server doctor` output with the release record.

## Agent and operator contract

Agents extending this template must preserve these boundaries:

- do not create a generic or starter app/domain;
- `auth-app-api` always maps to `auth-app-api.<PUBLIC_DOMAIN>` in per-app mode,
  and the same rule applies to every app ID;
- only `landing-app` or `site-app` may own the apex;
- add new public apps to the Compose domain derivation and Nginx renderer in one
  change, with renderer tests and documentation;
- keep all container ports loopback-only when host Nginx owns the edge;
- do not hand-edit `/etc/nginx/conf.d/nest-react-boilerplate.conf`; change and
  test the renderer;
- never replace full-SHA tags with `latest`, expose secrets in environment
  output, bypass `nginx -t`, or make Git updates non-fast-forward;
- run `pnpm run test:deploy`, `pnpm run server:validate`, and
  `pnpm run deploy:validate:docker` after deployment-tool changes.

Relevant source files are:

- `deploy/single-server/bootstrap.sh` — empty-host entrypoint;
- `deploy/single-server/serverctl` — idempotent host lifecycle;
- `scripts/single-server-deployment.mjs` — validated hosts and Nginx rendering;
- `scripts/compose-production.mjs` — Compose topology and derived runtime URLs;
- `docker/docker-compose.prod*.yml` — loopback runtime and database/profile
  overlays.
