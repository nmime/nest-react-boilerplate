# Notification Consumer

Headless NestJS consumer for durable notification background work. It validates
pending static-segment CSV objects, resolves dynamic and static segment members
into immutable audience snapshots, and materializes notification and delivery
rows in bounded idempotent chunks. It never exposes HTTP and never calls an
external notification provider.

Provider delivery remains owned by the separate `notification-scheduler`.
Applications and admin APIs only persist notification or broadcast commands.

## Verification

```bash
pnpm exec nx run notification-consumer:build
pnpm exec nx run notification-consumer:test
pnpm exec nx run notification-consumer:serve
```

## Runtime ownership

The `notifications` capability selects PostgreSQL, S3, this consumer, and the
notification scheduler. Local/production Compose and Helm run it as a
background process without a Service, ingress, HTTP port, probes, or HPA.
Configuration is documented in
[Notifications](../../../../docs/notifications.md) and the generated
[Project Catalog](../../../../docs/project-catalog.md).
