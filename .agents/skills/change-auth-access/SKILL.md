---
name: change-auth-access
description: Change authentication, sessions, tenants, roles, and authorization boundaries safely. Use for Better Auth configuration, guards, policies, RBAC, verification or reset flows, return URLs, and access-control tests.
---

# Change authentication or access control

## Read first

- Read the auth and access-control sections of `../../../docs/architecture.md`,
  `../../../docs/auth-tenant-hardening.md`, nearest app/library `AGENTS.md`
  files, problem-details registry, and current security tests. Read the social
  auth guides only when provider or bot login behavior is in scope.
- Trace the complete request path: public transport, session resolution, tenant context, policy/guard, domain service, and frontend state.

## Workflow

1. Keep authentication transport-neutral and provider behavior behind the existing auth boundary. Do not move provider delivery or secrets into controllers or UI.
2. Validate return URLs, origins, cookies, session state, and tenant identifiers with explicit allowlists and fail-closed defaults.
3. Enforce authorization on the backend at the owning resource boundary. Frontend visibility is not an authorization control.
4. Preserve the distinction between unauthenticated, unauthorized, forbidden, not-found, and conflict outcomes through RFC 9457 responses.
5. Apply least privilege to roles and policy composition; test cross-tenant and ownership-confusion cases.
6. Update generated clients and every affected app when the public session or policy contract changes.
7. Add security-focused tests for anonymous, valid, expired/revoked, wrong-role, wrong-tenant, and privilege-escalation paths as applicable.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Verification

Run auth library/API tests, affected app tests and e2e, contract/client checks when public types change, and `git diff --check`. Never use real credentials or weaken controls to make an attended provider test pass.
