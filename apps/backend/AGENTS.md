# Backend App Instructions

Follow the root [AGENTS.md](../../AGENTS.md) and detailed
[AI agent policy](../../docs/ai/agent-policy.md) first. This file adds rules for
`apps/backend/**`.

## Backend Boundaries

- Backend deployables live under `apps/backend/<scope>/<service>`; do not add a
  top-level `services/` tree in this repository.
- Keep service entrypoints, Nest module composition, app-local health config,
  and thin controllers in the owning app.
- Put reusable feature logic in `libs/backend/feature/**`, shared backend
  infrastructure in `libs/backend/common/**`, and persistence in the owning
  `libs/backend/postgres/main/**` library.
- Nest controllers and DTOs are the API source of truth. OpenAPI output under
  `contracts/openapi/**` is generated review output and should not be hand
  edited.
- Use `@app/backend-common-health` for shared `/health`, `/health/private`,
  `/live`, and `/ready` endpoints.
- App-level `package.json` files list app-local direct dependencies only;
  platform-wide backend dependencies belong in `libs/backend/package.json`.

## Request Context (CLS)

- Every backend app uses the `ClsInterceptor` globally (see root AGENTS.md).
  Do not re-register it at the app level.
- Read request-scoped data via:
  `import { requestContext } from '@app/backend-common-bootstrap'`.
