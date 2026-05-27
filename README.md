# Nest React Boilerplate

[![Node.js](https://img.shields.io/badge/node-26-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10.32.1-orange)](https://pnpm.io)
[![Nx](https://img.shields.io/badge/Nx-22-blue)](https://nx.dev)

A production-oriented Nx monorepo starter for teams building React frontends and NestJS APIs on PostgreSQL.

## Repository layout

```text
apps/           backend APIs, frontend apps, and e2e suites
libs/           shared backend, frontend, feature, common, and PostgreSQL libraries
contracts/      generated committed API contracts, including contracts/openapi
packages/tooling/ domain-grouped repository tooling and QA preset scripts
docs/           architecture, testing, deployment, and operations notes
docker/         compose/nginx files for the containerized stack
tools/          tiny compatibility shims for legacy script paths
```

## Getting started

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm run dev:db
pnpm run db:migrate
pnpm run dev:fullstack
```

## API contracts and clients

Generated OpenAPI contracts are committed under `contracts/openapi` and regenerated with:

```bash
pnpm api:contracts
pnpm api:clients
```

See [OpenAPI and typed client scaffold](docs/api-client.md).

## Testing and QA

Fast checks:

```bash
pnpm run check
pnpm run quality:presets
```

Additional runnable presets include OpenAPI fuzzing, accessibility, cross-browser/mobile Playwright, performance, security DAST, mutation, and property checks. See [Modern QA and testing matrix](docs/testing/modern-qa.md).

## Deployment and operations

See [Deployment and local stack readiness](docs/deployment.md), [Operations runbook](docs/operations.md), and [Production readiness checklist](docs/production-readiness.md).

## License

MIT.
