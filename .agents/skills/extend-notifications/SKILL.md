---
name: extend-notifications
description: Extend notification events, templates, providers, scheduling, and delivery. Use for notification channels, provider resolvers, auth messages, consumer or scheduler behavior, retries, idempotency, and delivery observability.
---

# Extend notifications

## Read first

- Read `../../../docs/notifications.md`, `../../../docs/project-catalog.md`, then
  inspect the event contract, template registry, provider resolver, scheduler,
  consumer, persistence, admin surface, and tests.
- Identify whether the change belongs to event creation, scheduling, rendering, provider transport, delivery execution, or product administration.

## Workflow

1. Keep producers transport-neutral. Emit a stable notification intent instead of calling email, chat, or push providers from auth or domain code.
2. Put provider choice and credentials behind the notification provider resolver. Validate provider-specific configuration without exposing secrets.
3. Make template inputs typed, localized, escaped appropriately, and version-compatible with queued events.
4. Define deduplication, scheduling, retry/backoff, terminal failure, and observability behavior before adding a delivery path.
5. Keep the scheduler responsible for due-work selection and the consumer responsible for execution; do not create competing schedule owners.
6. Add provider contract tests plus end-to-end scheduler/consumer coverage for success, retryable failure, permanent failure, and duplicate delivery.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Verification

Run notification library, scheduler, consumer, and affected producer tests/builds; run Docker-backed integration when required. Report external-provider live delivery as unverified unless an explicitly authorized controlled canary ran.
