# ADR 0005: Better Auth adoption for session ownership

- Status: Accepted
- Date: 2026-08-04
- Owners: @nmime

## Context

The template needs production-grade authentication: opaque sessions, rotation
on sign-in, account reload fail-closed behavior, and provider-based social
login (Discord, Telegram), without maintaining a bespoke session/token engine
per product fork.

## Decision

Session ownership and lifecycle are delegated to Better Auth (pinned to
`1.6.23` via workspace overrides after CVEs in earlier majors). Sessions are
opaque IDs persisted by the selected durable provider (PostgreSQL or replica-set
MongoDB), delivered as HttpOnly cookies, rotated on authentication, with
fail-closed account/RBAC reloads. Better Auth types, session types, and
migration scripts live in the backend auth libraries; `BETTER_AUTH_SECRET`
(and file-based variants in production) protects session material.

## Consequences

- OAuth/social flows get state-hash verification, PKCE where supported,
  signed-token validation, and isolated provider cookies from one reviewed
  dependency (`SECURITY.md`).
- Security patches require bumping the pinned Better Auth version in
  `pnpm-workspace.yaml` overrides rather than patching local code.
- Custom auth behavior stays behind the session guard and RBAC catalog rather
  than replacing the session engine.

## Alternatives Considered

- Hand-rolled JWT session engine: rejected as a maintenance and security
  liability compared with a reviewed, patched library.
- Full OIDC server adoption: rejected as disproportionate for the template's
  default needs; OIDC remains available as a provider integration.

## Validation

Auth token store and repository specs (`libs/backend/feature/auth/main/lib`
and `libs/backend/postgres/main/auth/lib`), the security hardening notes in
`SECURITY.md`, and the session-secret requirements in
`docs/environment-variables.md`.
