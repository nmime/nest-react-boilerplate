# Notification Scheduler

Cron-driven notification delivery process. It claims durable delivery rows,
resolves recipients and provider strategies, sends messages, persists retry or
terminal outcomes, and maintains future delivery partitions. It exposes no
HTTP surface.

## Verification

```bash
pnpm exec nx run notification-scheduler:build
pnpm exec nx run notification-scheduler:test
pnpm exec nx run notification-scheduler:serve
```

## Completion contract

This source scaffold is not automatically added to the setup catalog or runtime.
Register its stable ID, classification, dependencies, and enterprise-profile
membership before `pnpm nrb setup` can select it; `pnpm run onboarding:verify`
fails until every real Nx application is registered. Then complete the applicable
[deployable registration checklist](../../../../docs/scaffolding-and-extension.md#application-completion-checklist)
for local Compose, Docker/Helm, ingress, DNS, TLS, and observability before
calling the service production-ready. Keep Nx identity and tags in
`project.json`; do not copy them into this README.
