---
name: prepare-deployment
description: Prepare Docker, Helm, GitOps, or single-server deployment configuration without releasing. Use for images, charts, values, probes, resources, secrets references, ingress, runtime configuration, and deployment validation.
---

# Prepare deployment configuration

## Read first

- Read `../../../docs/deployment.md`, `../../../docs/deployment-platforms.md`,
  `../../../docs/project-catalog.md`, and the selected app's Docker, Helm,
  GitOps, environment, and operations files. Read
  `../../../docs/single-server-deployment.md` for that topology or
  `../../../docs/production-deploy.md` for the production platform workflow.
- Confirm which deployables and environment are in scope. Generated source is not automatically selected, public, or deployed.

## Workflow

1. Map each deployable to build context, immutable image, command, port, health/readiness probes, resources, configuration, secrets, persistence, dependencies, and exposure.
2. Keep public ingress explicit. Internal workers and schedulers must not gain routes merely because a shared chart supports ingress.
3. Reference secrets through the repository's deployment mechanism; never embed secret values or dump live environment state.
4. Preserve rolling compatibility across application, schema, queue/event contracts, and generated clients.
5. Validate chart/value composition, container startup assumptions, dependency ordering, shutdown grace, and observable failure signals.
6. Update runbooks and environment matrices from the actual configuration.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Verification and boundary

Run local image builds, config/render validation, Helm lint/template or GitOps validation, and deployment-focused tests that do not mutate a live environment. Preparation does not authorize pushing images, applying manifests, changing DNS, spending funds, or deploying.
