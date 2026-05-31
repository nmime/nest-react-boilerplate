# Billing and admin roadmap stubs

These are intentionally stubs, not half-built product surfaces. Keep them behind feature flags until the owning team commits to a provider and data model.

## Billing roadmap

- Feature flag: `billing.portal`.
- First provider decision: Stripe Billing vs. Paddle vs. internal invoicing.
- First vertical slice: read-only subscription status in `user-app` and admin customer lookup in `admin-app`.
- Required abstractions: billing customer mapping, checkout/session creator, webhook verifier, entitlement reader.
- Required tests: webhook signature validation, idempotent event processing, entitlement downgrade/upgrade scenarios.

## Admin roadmap

- Feature flag: `admin.audit`.
- First vertical slice: searchable audit-event list for privileged admins.
- Required abstractions: audit event writer, audit event reader, retention policy.
- Required tests: RBAC denial, tenant isolation, pagination stability, redacted payload rendering.

## Exit criteria before enabling by default

- API lifecycle state is at least beta.
- OpenAPI contracts and generated clients are current.
- E2E smoke covers one happy path and one authorization failure.
- Operational runbook covers provider outages and rollback.
