# Quick Start

Get the Nest React Boilerplate running locally in under five minutes.

## Prerequisites

| Requirement      | Version                  | How to check       |
| ---------------- | ------------------------ | ------------------ |
| Node.js          | `>=24 <25`               | `node --version`   |
| pnpm             | `11.15.1` (via Corepack) | `pnpm --version`   |
| Docker & Compose | any recent version       | `docker --version` |
| Git              | any recent version       | `git --version`    |

### Install Node.js and pnpm

```bash
nvm use          # reads .nvmrc for the pinned patch version
corepack enable
corepack prepare pnpm@11.15.1 --activate
```

## 1. Clone and install

```bash
git clone https://github.com/nmime/nest-react-boilerplate.git
cd nest-react-boilerplate
pnpm install --frozen-lockfile
```

## 2. Health check

Run the workspace doctor to verify your environment:

```bash
pnpm --filter @repo/tooling tooling doctor
```

Expected output (fresh clone with the committed reference selection):

```
  ✓ runtime-version      Node.js v24.18.0
  ✓ pnpm                 pnpm 11.15.1
  ○ docker               Docker not available — optional for E2E tests
  ✓ manifests            package.json, tsconfig.base.json present
  ✓ lock-file            pnpm-lock.yaml present
  ✓ nx-graph             Nx project graph resolves
  ✓ nrb-config           nrb.config.json valid (v1.0.0)
  ✓ nrb-state            .nrb/state.json valid (19 tracked files)
  ✓ capability-wiring    7 capabilities activated deterministically
  ○ compose-selection    Docker not available — selected postgres Compose graph was not checked
  ✓ tooling-package      @repo/tooling v0.0.0 — repo-tooling + nrb bins present
  ✓ selected-closure     75 projects, 119 product packages, and 39 tooling packages resolve

Summary: 10 passed, 0 failed, 0 warnings, 2 skipped
```

The upstream template tracks a committed reference selection
(`nrb.config.json` plus the generated `.nrb/` state), so `nrb-config`,
`nrb-state`, and `capability-wiring` already pass on a fresh clone without any
setup run. The two `○ skipped` entries (`docker`, `compose-selection`) are
Docker-dependent and pass once Docker is available.

## 3. Initialize product identity

From a clean branch, replace the boilerplate name and every public frontend/API
domain before product work:

```bash
pnpm nrb init \
  --name "Acme App" \
  --domain acme.example \
  --owner acme-org \
  --dry-run
pnpm nrb init \
  --name "Acme App" \
  --domain acme.example \
  --owner acme-org
```

`--domain` is required and must be a DNS base without a protocol, port, path,
or wildcard. The command rewrites every `example.com` app/API/staging hostname;
it does not create DNS records, TLS certificates, or secrets.

Skip this step only when evaluating the upstream template unchanged.

## 4. Select applications and capabilities

The upstream template ships a committed reference selection (10 apps plus 7
capabilities) so maintainers can run every surface; a product fork replaces it
with its own explicit choice. Choose only the frontend and backend deployables
this product needs. Profiles such as `web` and `fullstack` are optional
shortcuts; every application remains individually selectable.

### Interactive setup (recommended)

```bash
pnpm nrb setup
```

On the first run, `custom` is the default starting point. Select frontend,
backend, E2E, and capability entries individually. On later runs, the wizard
loads the current selection; pressing Enter keeps existing choices while `y`
adds another application.

### Non-interactive setup (CI / scripted)

```bash
# Exact profile shortcut:
pnpm nrb setup --preset fullstack --non-interactive

# Add another frontend later without replacing current choices:
pnpm nrb setup --app mobile-app --non-interactive

# Inspect available/current choices:
pnpm nrb setup --list

# Using a config file:
cp nrb.config.example.json nrb.config.json
# Edit nrb.config.json
pnpm nrb setup --config nrb.config.json

# Dry run first:
pnpm nrb setup --preset fullstack --dry-run
```

`pnpm run dev` requires `.nrb/workspace.json` and starts only its selected
deployables. This deliberate refusal before setup prevents a hidden default app
or an accidental all-services development stack.

## 5. Environment variables

```bash
cp .env.example .env
```

Review `.env` and replace placeholder secrets with real values from your secret manager. Never commit real `.env` files.

## 6. Start the selected database

```bash
pnpm run dev:db
```

Every preset currently selects PostgreSQL. To use the first-class MongoDB
alternative, swap the capability before starting infrastructure:

```bash
pnpm nrb setup --remove-capability postgres --capability mongodb --non-interactive
```

For the default PostgreSQL selection, `pnpm run dev:db` starts PostgreSQL. For
MongoDB, start and initialize its local one-node replica set instead:

```bash
docker compose --profile mongodb up -d mongodb mongodb-init
```

The one-node replica set supports transactions but is not highly available. Run
the provider-dispatched migrations:

```bash
pnpm run db:migrate
```

## 7. Start development servers

```bash
# Applications selected by setup:
pnpm run dev

# Start every serve target, including bot integrations:
pnpm run dev:all

# Or start specific apps with Nx:
pnpm exec nx serve admin-app
pnpm exec nx serve user-app
pnpm exec nx serve admin-app-api
```

### Local port contract

Use the [Project Catalog](project-catalog.md) for application identities and
runtimes, and the [Service Port Registry](PORTS.md) for the authoritative local
and staging ports.

Start Vike: `pnpm exec nx serve site-app`. Start Expo: `pnpm exec nx serve mobile-app`.

### API health endpoints

Every NestJS API exposes these health/readiness endpoints:

- `GET /health` — public health check
- `GET /health/private` — authenticated health check
- `GET /live` — liveness probe
- `GET /ready` — readiness probe

Example:

```bash
curl http://localhost:3003/health
```

## 8. Verify everything works

Run the fast preflight:

```bash
pnpm run check:fast
```

This runs static checks, formatting, linting, typecheck, and unit tests.

To prove the complete onboarding and application-generator contract after a
fresh install:

```bash
pnpm run onboarding:verify
```

## What's next?

- **Request context** is automatic — `ClsInterceptor` runs first, `requestContext.getRequestId()` works everywhere. No setup needed.
- **Error handling** is automatic — RFC 9457 Problem Details with `application/problem+json`. No setup needed.
- [Setup and Configuration](setup/configuration.md) — deep dive into the setup engine and config schema.
- [Scaffolding and Extension Contract](scaffolding-and-extension.md) — required/optional surfaces and the complete add-app/library/feature lifecycle.
- [First Feature Walkthrough](first-feature-walkthrough.md) — ship your first vertical slice.
- [CLI Reference](setup/cli-reference.md) — every command with flags and examples.
- [Launching a New Project](new-project.md) — rename and harden the boilerplate for your product.
