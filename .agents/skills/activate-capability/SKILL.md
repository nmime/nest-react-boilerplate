---
name: activate-capability
description: Integrate an optional repository capability into explicitly selected applications. Use for setup-catalog entries, owned-project wiring, environment requirements, Docker services, backend composition, and repeatable capability activation.
---

# Activate an optional capability

## Read first

- Read `../../../docs/scaffolding-and-extension.md`, `../../../docs/project-catalog.md`, and the setup command implementation.
- Inspect the capability owner, target app composition roots, environment schema, local infrastructure, project graph, and existing catalog entries.

## Workflow

1. Define what the capability owns and which app kinds can select it. Do not make it implicit for every application.
2. Add a stable setup catalog identifier with explicit `ownedProjects`, configuration, environment, infrastructure, and dependency effects.
3. Wire runtime composition only through the selected app owner. Keep reusable implementation in the correct `libs/backend`, `libs/frontend`, or `libs/common` scope.
4. Make activation repeatable: a second identical setup must not duplicate config, modules, imports, services, or dependencies.
5. Make de-selection behavior explicit when supported; never silently delete user-owned code or data.
6. Add catalog, plan, repeatability, and doctor coverage plus source-backed CLI docs.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Verification

Run focused setup/tooling tests, `pnpm run agent:verify`, `pnpm nrb doctor --json`, selected-project builds, and `git diff --check`. Report any manual secret, external account, migration, or deployment prerequisite separately.
