---
name: service-audit
description: Audit a repository app, service, worker, frontend, or package against its source-backed contracts. Use for operational readiness, architecture and boundary review, test-gap analysis, or documentation drift assessment.
---

# Audit a repository project

## Read first

1. Read `../../../AGENTS.md` and `../../../docs/ai/agent-policy.md`.
2. Read `../../../docs/ai/repo-map.md` and the owning `project.json` or `package.json`.
3. Read the service/app entrypoint, module wiring, tests, contracts, environment handling, and nearest docs.
4. For API services, inspect health endpoints, OpenAPI output, DTOs/controllers, validation, logging, and migrations touched by the service.
5. For frontend apps, inspect routing, API client usage, shared UI/runtime imports, state ownership, i18n, and smoke/build targets.

## Workflow

1. Verify project config against the command matrix, Nx naming, tags, and public aliases.
2. Trace the public API and confirm generated artifacts are current when applicable.
3. Compare health/readiness, environment, secrets, observability, and operations docs with source behavior.
4. Map primary behavior and failure paths to static, unit, integration, browser,
   infrastructure, and deployment evidence.
5. Check backend/frontend/common boundaries and confirm generated files are source-derived.
6. Identify stale project names, package versions, commands, or removed paths in documentation.

## Specification assurance

For behavior-changing diffs, include
`$review-specification-assurance` in the independent review so requirement
completeness, ownership, evidence meaning, and exact-SHA provenance are checked.

## Verification

Run the narrowest safe checks needed to confirm findings, then broaden only for
shared or runtime-critical boundaries. An audit does not authorize fixes,
deployment, credential use, or external mutations. Report unavailable runtime
lanes as unverified.

## Output format

Use a concise audit report with:

- scope audited
- findings by severity
- verification commands run
- docs or tests that should be updated
- explicit blockers where verification could not run
