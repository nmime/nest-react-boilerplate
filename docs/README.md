# Documentation Index

Role-based entry points and reference guides for the Nest React Boilerplate monorepo.

## Getting started

- [Quick Start](quick-start.md) — clone, set up, and run the stack in under five minutes.
- [Launching a New Project](new-project.md) — rename, initialize, and harden the boilerplate for your product.
- [First Feature Walkthrough](first-feature-walkthrough.md) — end-to-end guide for shipping a vertical slice.

## Setup and configuration

- [Setup and Configuration](setup/configuration.md) — interactive and noninteractive setup, `nrb doctor`, config schema.
- [Presets and Technologies](setup/presets-and-technologies.md) — preset matrix, supported apps/capabilities, dependency rules.
- [CLI Reference](setup/cli-reference.md) — every `nrb` / `repo-tooling` command with flags and examples.
- [Nx Generators](setup/nx-generators.md) — built-in Nx generators, schema overrides, and `nx g` examples.

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
- [Technology Choices](technology-choices.md) — framework and platform decisions.

## API and contracts

- [API Contracts](api-contracts.md) — OpenAPI generation, consumer contracts, and error responses.
- [API Conventions](api-conventions.md) — controller patterns, DTOs, validation, and guards.
- [API Lifecycle Policy](api-lifecycle-policy.md) — versioning, deprecation, and compatibility rules.
- [API Client](api-client.md) — generated frontend clients and typed service wrappers.

## Frontend

- [Frontend FSD](frontend-fsd.md) — Feature-Sliced Design boundaries and enforcement.
- [Frontend State](frontend-state.md) — TanStack Query, MobX shell state, theme/i18n ownership.
- [Frontend UX](frontend-ux.md) — shared UI primitives, Storybook, and accessibility.
- [Frontend SSR Strategy](frontend-ssr-framework-strategy.md) — Vike SSR and Astro island architecture.
- [Frontend Deployment Topology](frontend-deployment-topology.md) — build outputs, CDN, and edge considerations.

## Database and persistence

- [Database Migrations](database-migrations.md) — MikroORM standards, naming, and review checklist.
- [Dependency Management](dependency-management.md) — supply chain, versions, and update policy.

## Testing and quality

- [Testing Guide](testing.md) — unit, component, and e2e strategy.
- [Modern QA](testing/modern-qa.md) — Storybook tests, mutation testing, and coverage gates.
- [Test Reliability](testing/test-reliability.md) — flaky test detection and isolation.

## Operations and deployment

- [Operations Guide](operations.md) — release, runtime, and runbook overview.
- [Production Deploy](production-deploy.md) — Kubernetes, Ansible, and Helm deployment.
- [Deployment](deployment.md) — Docker Compose, Dockerfiles, and multi-stage builds.
- [Production Readiness](production-readiness.md) — checklists for launch.
- [Release Hardening](release-hardening.md) — pre-release audit and verification steps.
- [Local Verification](local-verification.md) — reproducible workstation checks.
- [CI Observability](ci-observability.md) — GitHub Actions pipelines and quality gates.
- [Branch Protection](branch-protection.md) — repository governance and merge rules.
- [GitOps](../GITOPS.md) — infrastructure-as-code and continuous delivery.

### Operations deep dives

- [Health Checks](operations/health-checks.md)
- [Logging](operations/logging.md)
- [OpenTelemetry](operations/otel.md)
- [Observability and Disaster Recovery](operations/observability-dr.md)
- [RPO/RTO](operations/rpo-rto.md)
- [Dependency Triage](operations/dependency-triage.md)
- [Execution Policy](operations/execution-policy.md)
- [Backend Reliability Backlog](operations/backend-reliability-backlog.md)

### Runbooks

- [Runbook Index](runbooks/README.md)
- [Service Incident Template](runbooks/service-incident.md)

## Security and auth

- [Security Baseline](../SECURITY.md) — reporting expectations and baseline controls.
- [Auth Production Roadmap](auth-production-roadmap.md)
- [Auth Tenant Hardening](auth-tenant-hardening.md)
- [Social Auth and Bots](social-auth-bots.md)

## AI agent policy

- [Agent Policy](ai/agent-policy.md) — rules for AI coding agents in this repo.
- [Repo Map for Agents](ai/repo-map.md) — context organization for agents.
- [Retrieval Policy](ai/retrieval-policy.md)
- [Context Packing](ai/context-packing.md)
- [Agent Workflows](ai/agent-workflows.md)

## Reference

- [Command Matrix](command-matrix.md) — supported local and CI commands.
- [Feature Flags](feature-flags.md)
- [i18n](i18n.md)
- [NATS](nats.md)
- [Notifications](notifications.md)
- [API Toast Configuration](api-toast-config.md)
- [Docker Compose Production](docker-compose-production.md)
- [Production Hardening](production-hardening.md)
- [Agent Skills](agent-skills.md)
- [Billing Admin Roadmap](billing-admin-roadmap.md)
