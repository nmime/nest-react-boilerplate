# Billing extension and admin capability status

This page records the current implementation boundary. It does not reserve
feature flags, providers, routes, or data models that are absent from the
workspace.

## Billing is product-owned

The repository does not currently include a billing provider, billing domain
model, billing API/UI, entitlement service, webhook handler, or a
runtime `billing.portal` feature flag. Occurrences of `billing` in feature-flag
tests and generator fixtures are examples, not a shipped product capability.

When a product actually needs billing, choose the provider and invariants first,
then generate or add the feature through the normal ownership flow. A complete
slice should include:

- a tenant-scoped customer/subscription model and explicit persistence owner;
- signed webhook verification, replay protection, and idempotent processing;
- checkout/session and entitlement interfaces that do not leak provider types
  into application code;
- OpenAPI contracts, generated clients, authorization, migrations, and
  rollback-safe event handling;
- tests for signature failures, duplicate delivery, upgrades, downgrades,
  cancellation, and provider outage behavior.

Use `pnpm nrb add feature <name> --api-app <api> --frontend-app <app> --dry-run`
only after choosing the real owners. Do not enable a made-up flag or copy the
generator's billing examples into production code.

## Admin capability is implemented

The checked-in admin surface is implemented. It currently provides:

- tenant-scoped user listing, detail, status, and access-policy mutation;
- role creation/update and assignment with fail-closed RBAC/CASL checks;
- transactional audit-log and outbox writes for protected admin mutations;
- a permission-gated, paginated audit API and `/admin/audit` UI;
- dashboard summaries and tenant-scoped error-presentation controls.

The backend controllers and DTOs remain the API source of truth. The admin app
uses generated clients, while `admin:settings:*`, `admin:audit:read`, user, and
role permissions remain explicit authorization boundaries. Extend these owners
in place rather than creating a second admin scaffold.

## Completion criteria for new product capabilities

Before exposing any new billing or admin capability, require current OpenAPI
and generated clients, tenant/RBAC tests, one authorization-failure e2e path,
operational rollback/outage guidance, and audit-safe handling of sensitive
provider payloads.
