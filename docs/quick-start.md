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
git clone https://github.com/nest-react-boilerplate/monorepo.git
cd monorepo
pnpm install --frozen-lockfile
```

## 2. Health check

Run the workspace doctor to verify your environment:

```bash
pnpm --filter @repo/tooling tooling doctor
```

Expected output (clean install, no setup yet):

```
  ✓ node-version         Node.js v24.x.x
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

The boilerplate ships with all apps and capabilities present. You can run it as-is, or configure it to your needs.

### Interactive setup (recommended)

```bash
pnpm --filter @repo/tooling tooling setup
```

You will be guided through preset selection, app toggles, and capability toggles.

### Non-interactive setup (CI / scripted)

```bash
# Using a preset:
pnpm --filter @repo/tooling tooling setup --preset fullstack --non-interactive

# Using a config file:
cp nrb.config.example.json nrb.config.json
# Edit nrb.config.json
pnpm --filter @repo/tooling tooling setup --config nrb.config.json

# Dry run first:
pnpm --filter @repo/tooling tooling setup --preset starter --dry-run
```

### Skip setup

If you want all apps and capabilities, skip setup entirely. The boilerplate is pre-configured for the full stack.

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
# All apps (recommended for full-stack dev):
pnpm run dev:fullstack

# Or start specific apps with Nx:
pnpm exec nx serve admin-app
pnpm exec nx serve user-app
pnpm exec nx serve admin-app-api
```

### Default local ports

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

## 7. Verify everything works

Run the fast preflight:

```bash
pnpm run check:fast
```

This runs static checks, formatting, linting, typecheck, and unit tests.

## What's next?

- [Setup and Configuration](setup/configuration.md) — deep dive into the setup engine and config schema.
- [First Feature Walkthrough](first-feature-walkthrough.md) — ship your first vertical slice.
- [CLI Reference](setup/cli-reference.md) — every command with flags and examples.
- [Launching a New Project](new-project.md) — rename and harden the boilerplate for your product.
