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

## 3. Configure the boilerplate

The boilerplate ships with neutral and reference applications. The recommended
`starter` preset selects `starter-app`; it does not reuse the reference
admin/user page composition.

### Interactive setup (recommended)

```bash
pnpm nrb setup
```

You will be guided through preset selection, app toggles, and capability toggles.

### Non-interactive setup (CI / scripted)

```bash
# Neutral product baseline:
pnpm nrb setup --preset starter --non-interactive

# Using a config file:
cp nrb.config.example.json nrb.config.json
# Edit nrb.config.json
pnpm nrb setup --config nrb.config.json

# Dry run first:
pnpm nrb setup --preset starter --dry-run
```

### Skip setup

Before setup, `pnpm run dev` uses the neutral starter selection:
`starter-app`, `user-app-api`, and `auth-app-api`. Run the `fullstack` or
`enterprise` preset only when you intentionally want the richer reference apps.

## 4. Environment variables

```bash
cp .env.example .env
```

Review `.env` and replace placeholder secrets with real values from your secret manager. Never commit real `.env` files.

## 5. Start the database

```bash
pnpm run dev:db
```

This starts PostgreSQL via Docker Compose. Run migrations:

```bash
pnpm run db:migrate
```

## 6. Start development servers

```bash
# Neutral starter plus its APIs:
pnpm run dev

# Explicitly start every serve target, including reference apps:
pnpm run dev:all

# Or start specific apps with Nx:
pnpm exec nx serve starter-app
pnpm exec nx serve admin-app
pnpm exec nx serve user-app
pnpm exec nx serve admin-app-api
```

### Default local ports

| App         | Port | Framework         |
| ----------- | ---- | ----------------- |
| starter-app | 4204 | React + Vite      |
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

## 7. Verify everything works

Run the fast preflight:

```bash
pnpm run check:fast
```

This runs static checks, formatting, linting, typecheck, and unit tests.

## What's next?

- **Request context** is automatic — `ClsInterceptor` runs first, `requestContext.getRequestId()` works everywhere. No setup needed.
- **Error handling** is automatic — RFC 9457 Problem Details with `application/problem+json`. No setup needed.
- [Setup and Configuration](setup/configuration.md) — deep dive into the setup engine and config schema.
- [First Feature Walkthrough](first-feature-walkthrough.md) — ship your first vertical slice.
- [CLI Reference](setup/cli-reference.md) — every command with flags and examples.
- [Launching a New Project](new-project.md) — rename and harden the boilerplate for your product.
