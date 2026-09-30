# Notification Consumer

NestJS consumer for durable notification background work. It validates
pending static-segment CSV objects, resolves dynamic and static segment members
into immutable audience snapshots, and materializes notification and delivery
rows in bounded idempotent chunks. It retains the shared private operational
HTTP host for health and never calls an external notification provider. Browser
cookie sessions, CORS, Swagger, and product HTTP controllers are disabled.

Provider delivery remains owned by the separate `notification-scheduler`.
Applications and admin APIs only persist notification or broadcast commands.

## Verification

```bash
pnpm exec nx run notification-consumer:build
pnpm exec nx run notification-consumer:test
pnpm exec nx run notification-consumer:serve
```

## Runtime ownership

The `notifications` capability selects the configured durable database provider,
S3, this consumer, and the notification scheduler. The development listener
defaults to port 3004 and `PORT` may override it. Compose and Helm classify it as
a background process without a public hostname or ingress. The current chart
does not create a worker Service or HTTP probes; process startup alone does not
prove database readiness or successful materialization.
Configuration is documented in
[Notifications](../../../../docs/notifications.md) and the generated
[Project Catalog](../../../../docs/project-catalog.md).
