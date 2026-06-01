# Nest React Boilerplate

[![CI](https://github.com/nmime/nest-react-boilerplate/actions/workflows/ci.yml/badge.svg)](https://github.com/nmime/nest-react-boilerplate/actions/workflows/ci.yml)
[![CodeQL](https://github.com/nmime/nest-react-boilerplate/actions/workflows/codeql.yml/badge.svg)](https://github.com/nmime/nest-react-boilerplate/actions/workflows/codeql.yml)
[![Dependency review](https://github.com/nmime/nest-react-boilerplate/actions/workflows/dependency-review.yml/badge.svg)](https://github.com/nmime/nest-react-boilerplate/actions/workflows/dependency-review.yml)
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

Fast PR preflight:

```bash
pnpm run check:fast
```

`check:fast` runs the Prettier check plus Nx lint, typecheck, and unit test targets. Add coverage and dependency review checks when a PR changes runtime code or dependencies:

```bash
pnpm run test:coverage
pnpm run audit
```

The CI workflow runs `check:fast` as the first PR gate before the longer quality and runtime-backed gates. Workflow run summaries and a `ci-status-summary` artifact provide a compact status table when check-run API details are unavailable. See [CI observability](docs/ci-observability.md).

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
