# Documentation Index

Role-based entry points and reference guides for the Nest React Boilerplate monorepo.

## Getting started

- [First Feature Walkthrough](first-feature-walkthrough.md) — end-to-end guide for shipping a vertical slice.
- [Scaffolding and Extension Contract](scaffolding-and-extension.md) — canonical fresh-clone, app/library/feature, domain, and production-registration lifecycle.
- [Project Catalog](project-catalog.md) — generated application IDs, Nx roots, runtimes, selection dependencies, and template hostnames.

## Setup and configuration

- [Setup and Configuration](setup/configuration.md) — interactive and noninteractive setup, `pnpm nrb doctor`, config schema.
- [Product Identity](product-identity.md) — the identity value set, the repeatable `nrb init` rename path, and the placeholder-residue gate.
- [Presets and Technologies](setup/presets-and-technologies.md) — preset matrix, supported apps/capabilities, dependency rules.
- [CLI Reference](setup/cli-reference.md) — every `nrb` / `repo-tooling` command with flags and examples.
- [Nx Generators](setup/nx-generators.md) — repository generators, generated contracts, and verification.
- [Discord Bot Setup](setup/discord-bot.md) — select, configure, and validate the Discord bot integration.

## Day-to-day usage

- [Adding a New Service](usage/adding-a-new-service.md) — create and wire a NestJS backend service.
- [Adding a New Frontend Page](usage/adding-a-new-frontend-page.md) — add a route, page, and tests to a frontend app.
- [Adding an Auth Provider](usage/adding-an-auth-provider.md) — integrate a Better Auth provider with database migrations.

## Extension and migration

- [Extending Generators](setup/extending-generators.md) — catalog entries, planner operations, adapters, and templates.
- [Migration Guide](setup/migration.md) — migrate from `init:project` / `generate:feature` to the NRB setup engine.
- [Troubleshooting](setup/troubleshooting.md) — recovery for dirty trees, conflicts, stale state, Docker issues, and failed rollbacks.

## Architecture

- [Architecture Overview](architecture.md) — app/library split, runtime boundaries, data flow.
- [Architecture Deep Dives](architecture/README.md) — DDD boundaries, naming conventions, and library contracts.
- [Architecture Decision Records](adr/README.md) — durable decisions and ADR template.

## API and contracts

- [API Contracts](api-contracts.md) — OpenAPI generation, consumer contracts, and error responses.
- [API Conventions](api-conventions.md) — controller patterns, DTOs, validation, and guards.
- [Backend Product Primitives](backend-product-primitives.md) — paging, idempotency keys, uploads, money, tenant scoping, and the open catalogs.
- [API Lifecycle Policy](api-lifecycle-policy.md) — versioning, deprecation, and compatibility rules.
- [API Client](api-client.md) — generated frontend clients and typed service wrappers.

## Frontend

- [Frontend FSD](frontend-fsd.md) — Feature-Sliced Design boundaries and enforcement.
- [Frontend State](frontend-state.md) — TanStack Query, MobX shell state, theme/i18n ownership.
- [Frontend UX](frontend-ux.md) — shared UI primitives, Storybook, and accessibility.
- [Frontend SSR Strategy](frontend-ssr-framework-strategy.md) — Vike SSR and Astro island architecture.
- [Frontend Deployment Topology](frontend-deployment-topology.md) — build outputs, CDN, and edge considerations.

## Database and persistence

- [Database Migrations](database-migrations.md) — PostgreSQL/MikroORM and native MongoDB migration, consistency, and non-parity contracts.
- [Dependency Management](dependency-management.md) — supply chain, versions, and update policy.

## Testing and quality

- [Testing Guide](testing.md) — unit, component, and e2e strategy.
- [Specification Assurance](specification-assurance.md) — OpenSpec requirements, explicit Cucumber dispositions, evidence lanes, and exact-SHA dossiers.
- [Modern QA](testing/modern-qa.md) — Storybook tests, mutation testing, and coverage gates.
- [Test Reliability](testing/test-reliability.md) — flaky test detection and isolation.

## Operations and deployment

- [Operations Guide](operations.md) — release, runtime, and runbook overview.
- [Production Deploy](production-deploy.md) — Kubernetes, Helm, and GitOps deployment.
- [Deployment](deployment.md) — Docker Compose, Dockerfiles, and multi-stage builds.
- [Production Readiness](production-readiness.md) — checklists for launch.
- [Release Hardening](release-hardening.md) — pre-release audit and verification steps.
- [Local Verification](local-verification.md) — reproducible workstation checks.
- [Bun Runtime Support](bun-runtime-research.md) — pinned Bun 1.3.14 compatibility contract, evidence, and adoption boundaries.
- [CI Observability](ci-observability.md) — GitHub Actions pipelines and quality gates.
- [CI Lanes](ci-lanes.md) — forge-neutral gate inventory and how GitHub and GitLab render it.
- [CI Cache](ci-cache.md) — cache ownership, keys, restore behavior, and troubleshooting.
- [Branch Protection](branch-protection.md) — repository governance and merge rules.
- [Deployment Platforms](deployment-platforms.md) — supported deployment targets and platform boundaries.
- [GitOps](../GITOPS.md) — infrastructure-as-code and continuous delivery.

### Operations deep dives

- [Health Checks](operations/health-checks.md)
- [Logging](operations/logging.md)
- [OpenTelemetry](operations/otel.md)
- [Observability and Disaster Recovery](operations/observability-dr.md)
- [RPO/RTO](operations/rpo-rto.md)
- [Dependency Triage](operations/dependency-triage.md)
- [Execution Policy](operations/execution-policy.md)

### Runbooks

- [Runbook Index](runbooks/README.md)
- [Service Incident Template](runbooks/service-incident.md)

## Security and auth

- [Security Baseline](../SECURITY.md) — reporting expectations and baseline controls.
- [Auth Tenant Hardening](auth-tenant-hardening.md)
- [Multi-tenancy Capability](multi-tenancy-capability.md)
- [Auth Login Analytics](auth-login-analytics.md)
- [Social Auth and Bots](social-auth-bots.md)
- [Social Auth Live Test Guide](social-auth-live-test-guide.md)
- [Security Platforms](security-platforms.md)
- [Supply Chain Security](supply-chain.md)

## AI agent policy

- [Agent Policy](ai/agent-policy.md) — rules for AI coding agents in this repo.
- [Repo Map for Agents](ai/repo-map.md) — context organization for agents.
- [Retrieval Policy](ai/retrieval-policy.md)
- [Context Packing](ai/context-packing.md)
- [Agent Workflows](ai/agent-workflows.md)

## Reference

- [Project Catalog](project-catalog.md)
- [Service Port Registry](PORTS.md)
- [Command Matrix](command-matrix.md) — supported local and CI commands.
- [Feature Flags](feature-flags.md)
- [Fiat Currency Catalogue](fiat-currency-catalogue.md)
- [i18n](i18n.md)
- [NATS](nats.md)
- [Notifications](notifications.md)
- [API Toast Configuration](api-toast-config.md)
- [Docker Compose Production](docker-compose-production.md)
- [Idempotent Single-Server Deployment](single-server-deployment.md)
- [Production Hardening](production-hardening.md)
- [Agent Skills](agent-skills.md)

## Boilerplate-owned content

Documentation about this boilerplate rather than about a product built from
it. A fork deletes this whole section along with `docs/boilerplate/**`; see
[Boilerplate-owned content](boilerplate/README.md) for the prune procedure.

- [Boilerplate-owned content](boilerplate/README.md) — what is prunable and how to prune it.
- [Quick Start](boilerplate/quick-start.md) — clone, set up, and run the stack in under five minutes.
- [Launching a New Project](boilerplate/new-project.md) — rename, initialize, and harden the boilerplate for your product.
- [Technology Choices](boilerplate/technology-choices.md) — framework and platform decisions.
- [Auth Production Gap Register](boilerplate/auth-production-roadmap.md) — unbuilt auth hardening checklist.
- [Billing Extension and Admin Capability Status](boilerplate/billing-admin-roadmap.md) — unbuilt billing roadmap.
- [Admin notification broadcasts](boilerplate/admin-notification-broadcasts-spec.md) — unbuilt broadcast specification.
- [TypeScript 7 Upgrade](boilerplate/upgrade-typescript-7.md) — staged compiler upgrade research.

## Documentation authority

Reference facts have one owner. Topic guides link to that owner instead of
copying project, hostname, port, command, or environment tables:

| Fact                                                                          | Canonical owner                                                             |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Application ID, Nx root, runtime, class, hostname, and selection dependencies | [Project Catalog](project-catalog.md)                                       |
| Library identity, tags, targets, and source root                              | The library's `project.json`; inspect with `pnpm exec nx show project <id>` |
| Public TypeScript aliases                                                     | `tsconfig.base.json`                                                        |
| Local and staging ports                                                       | [Service Port Registry](PORTS.md)                                           |
| Public root commands                                                          | [Command Matrix](command-matrix.md) and `package.json`                      |
| Environment variables                                                         | [Environment Variables](environment-variables.md) and `.env.example`        |
| Project-specific behavior                                                     | The nearest project `README.md` and `AGENTS.md`                             |

`docs/project-catalog.md` is generated. Change the setup catalog or Nx project
configuration, run `pnpm run docs:catalog`, and let `pnpm run docs:check` prove
that the rendered catalog and all local links remain current. The same check
requires every Markdown document under `docs/**` to be reachable from this
index, directly or through a linked nested index.

Working documents that are not canonical repository documentation — tool-written
specs, imported research, archived change records — are exempt from link and
reachability validation. `docs/.docsrc.json` declares which subtrees those are:

```json
{ "workingSpecPrefixes": ["docs/superpowers/"] }
```

Each entry is a workspace-relative directory prefix; a declaration replaces the
default rather than extending it, and an absolute or `..`-escaping entry fails
`pnpm run docs:check` instead of being ignored. Products repoint this file
instead of editing `scripts/validate-doc-links.mjs`.
