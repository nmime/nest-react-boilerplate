# Quick Start

Get the Nest React Boilerplate running locally in under five minutes.

## Prerequisites

| Requirement      | Version                  | How to check       |
| ---------------- | ------------------------ | ------------------ |
| Node.js          | `>=24 <25`               | `node --version`   |
| pnpm             | `11.11.0` (via Corepack) | `pnpm --version`   |
| Docker & Compose | any recent version       | `docker --version` |
| Git              | any recent version       | `git --version`    |

### Install Node.js and pnpm

```bash
nvm use          # reads .nvmrc for the pinned patch version
corepack enable
corepack prepare pnpm@11.11.0 --activate
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

Expected output (clean install, no setup yet):

```
  ✓ node-version         Node.js v24.18.0
  ✓ pnpm                 pnpm 11.11.0
  ✓ docker               Docker version ...
  ✓ manifests            package.json, tsconfig.base.json present
  ✓ lock-file            pnpm-lock.yaml present
  ✓ nx-graph             Nx project graph resolves
  ○ nrb-config           nrb.config.json not found — run setup to create
  ○ nrb-state            .nrb/state.json not found — no setup state
  ✓ tooling-package      @repo/tooling v0.0.0 — repo-tooling + nrb bins present

Summary: 7 passed, 0 failed, 0 warnings, 2 skipped
```

The two `○ skipped` entries for `nrb-config` and `nrb-state` are expected on a fresh clone. They pass after you run setup (see below).

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

No application is selected by default. Choose only the frontend and backend
deployables this product needs. Profiles such as `web` and `fullstack` are
optional shortcuts; every application remains individually selectable.

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

## 6. Start the database

```bash
pnpm run dev:db
```

This starts PostgreSQL via Docker Compose. Run migrations:

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

| App         | Port | Framework         |
| ----------- | ---- | ----------------- |
| admin-app   | 4200 | React + Vite      |
| user-app    | 4201 | React + Vite      |
| landing-app | 4202 | Astro             |
| site-app    | 4203 | Vike + React      |
| mobile-app  | 4300 | Expo/React Native |

Start Vike: `pnpm exec nx serve site-app`. Start Expo: `pnpm exec nx serve mobile-app`.

### API health endpoints

Every NestJS API exposes these health/readiness endpoints:

- `GET /health` — public health check
- `GET /health/private` — authenticated health check
- `GET /live` — liveness probe
- `GET /ready` — readiness probe

Example:

```bash
curl http://localhost:3000/health
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
