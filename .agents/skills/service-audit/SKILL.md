# Service audit skill

Use this skill to audit an app, backend service, worker, frontend app, or package in this repository.

## Required context

1. Read `../../../AGENTS.md` and `../../../docs/ai/agent-policy.md`.
2. Read `../../../docs/ai/repo-map.md` and the owning `project.json` or `package.json`.
3. Read the service/app entrypoint, module wiring, tests, contracts, environment handling, and nearest docs.
4. For API services, inspect health endpoints, OpenAPI output, DTOs/controllers, validation, logging, and migrations touched by the service.
5. For frontend apps, inspect routing, API client usage, shared UI/runtime imports, state ownership, i18n, and smoke/build targets.

## Audit checklist

- project config matches the current command matrix and Nx naming
- public API shape is source-backed and generated artifacts are current when applicable
- health/readiness and operations docs match source behavior
- secrets and environment variables are documented safely
- tests cover the primary behavior and failure paths
- imports respect backend/frontend/common boundaries
- generated files are not hand-edited
- docs do not describe stale project names, package versions, or removed paths

## Output format

Use a concise audit report with:

- scope audited
- findings by severity
- verification commands run
- docs or tests that should be updated
- explicit blockers where verification could not run
