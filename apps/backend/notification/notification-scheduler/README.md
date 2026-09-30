# Notification Scheduler

Cron-driven notification delivery process. It claims durable delivery rows,
resolves recipients and provider strategies, sends messages, persists retry or
terminal outcomes, and maintains future delivery partitions. It retains the
shared private operational HTTP host for health, with a development default
port of 3005 (`PORT` may override it). Browser cookie sessions, CORS, Swagger,
and product HTTP controllers are disabled.

## Verification

```bash
pnpm exec nx run notification-scheduler:build
pnpm exec nx run notification-scheduler:test
pnpm exec nx run notification-scheduler:serve
```

## Runtime ownership

The `notifications` capability selects this registered scheduler and its
consumer with the configured durable database provider. Compose and Helm run
the scheduler as a background process without a public hostname or ingress.
The current chart does not create a worker Service or HTTP probes. Successful
process startup does not prove database readiness, actual provider delivery,
or recipient acceptance. See [Notifications](../../../../docs/notifications.md)
and the generated [Project Catalog](../../../../docs/project-catalog.md).
