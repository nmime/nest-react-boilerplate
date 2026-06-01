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
```

## Getting started

Start with the [first feature walkthrough](docs/first-feature-walkthrough.md) after the stack boots, and use the [command matrix](docs/command-matrix.md) as the supported local/CI command contract.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm run dev:db
pnpm run db:migrate
pnpm run dev:fullstack
```

Local overrides can be copied from `.env.local.example`; test-only defaults live in `.env.test.example`; production placeholders live in `.env.production.example`. Never commit real `.env*` files or Docker secret files.

## API contracts and clients

Generated OpenAPI contracts are committed under `contracts/openapi` and regenerated with:

```bash
pnpm api:contracts
pnpm api:clients
```

See [OpenAPI and typed client scaffold](docs/api-client.md) and the [API lifecycle policy](docs/api-lifecycle-policy.md).

## Testing and QA

Fast PR checks:

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:coverage
pnpm run audit
```

Full release-risk checks:

```bash
pnpm run check
pnpm run quality:presets
```

Additional runnable presets include OpenAPI fuzzing, accessibility, cross-browser/mobile Playwright, performance, security DAST, mutation, and property checks. See [Modern QA and testing matrix](docs/testing/modern-qa.md).

## Dependency and supply-chain hygiene

Dependabot, Dependency Review, CodeQL, `pnpm audit`, Trivy image scanning, SBOM generation, and keyless image signing are configured in GitHub Actions. See [Dependency and supply-chain management](docs/dependency-management.md) for the update and review policy.

## Deployment and operations

See [Deployment and local stack readiness](docs/deployment.md), [Operations runbook](docs/operations.md), [Production readiness checklist](docs/production-readiness.md), [feature flags](docs/feature-flags.md), [notifications](docs/notifications.md), and the [billing/admin roadmap stubs](docs/billing-admin-roadmap.md).

## License

MIT.
