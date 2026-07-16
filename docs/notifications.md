# Notifications

The notification capability is a PostgreSQL-backed event feed plus delivery queue. This clean-install template has no legacy columns, dual writes, backfill jobs, or fallback reads.

## Ownership

| Project                                    | Responsibility                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `@app/common-notifications`                | Framework-neutral enums and immutable event, template, delivery, error, and channel-content contracts.                                         |
| `@app/backend-feature-notification-shared` | Application service, request DTOs, persistence and recipient-resolution ports, and domain errors. It never imports MikroORM.                   |
| `@app/backend-postgres-main-notification`  | MikroORM entities, the baseline schema migration, transactions, template replacement, queue queries, result persistence, and retry scheduling. |
| `@app/backend-feature-notification-main`   | Nest composition, optional HTTP controller, message rendering, target/channel strategies, scheduler, health, and partition maintenance.        |
| `@app/backend-feature-telegram-shared`     | Narrow Telegram transport token used by sibling backend features.                                                                              |
| `@app/backend-feature-telegram-bot`        | Actual Grammy bot runtime and Telegram API provider.                                                                                           |

## Data model

`notifications` is the immutable user-facing event/feed record. It stores target, template, data, extra, `in_app_visible`, and creation time. It does not store transport status, channel, attempts, errors, priority, or scheduling.

`notification_deliveries` is the only transport queue. Each row owns channel, provider, status, attempts, error, priority, `send_after`, `sent_at`, timestamps, and denormalized target identity. It is range-partitioned by `created_at`; the baseline migration creates the current and next six monthly partitions, while the worker maintains future partitions.

`notification_templates` owns stable code and description. Channel-specific engine/content lives only in `notification_template_channels`. In-app is template/event content, not a queue delivery.

Delivery states are:

- `pending`: ready now or scheduled for retry via `send_after`.
- `sent`: provider accepted the message.
- `rejected`: permanent recipient/provider rejection such as blocked bot or missing chat.
- `error`: non-retryable internal/unknown failure.

Retryable Telegram rate-limit, network, and gateway failures return to `pending`. PostgreSQL increments attempts and applies exponential delay starting at 30 seconds, capped at 30 minutes.

## Activating the capability

```bash
pnpm nrb setup --capability notifications --non-interactive
pnpm run docker:selected
```

Dependency expansion selects PostgreSQL, the Telegram capability, and `telegram-bot-api`. Setup writes the selected module composition into each backend app's `capabilities.generated.ts`; normal APIs receive producer-only notification composition and Telegram receives the worker. Removing the capability and rerunning setup removes those generated imports. No API imports `NotificationMainModule` directly.

## Creating templates and events

Application code injects `NotificationService`. First upsert a complete template; the operation replaces omitted channels so the database exactly matches source intent:

```ts
await notifications.upsertTemplate({
  code: 'account-linked',
  channels: [
    {
      channel: NotificationChannel.Bot,
      content: { body: { en: 'Account linked', ru: 'Аккаунт привязан' } },
    },
    {
      channel: NotificationChannel.InApp,
      content: { body: { en: 'Account linked', ru: 'Аккаунт привязан' } },
    },
  ],
});

await notifications.createTemplateNotification({
  targetType: NotificationTargetType.User,
  targetId: userId,
  templateCode: 'account-linked',
  channels: [NotificationChannel.Bot],
  inAppVisible: true,
  data: { displayName },
});
```

When `exposeHttp` is deliberately enabled, the equivalent endpoints are:

- `PUT /api/v1/notifications/templates`
- `POST /api/v1/notifications`
- `POST /api/v1/notifications/batch`

HTTP exposure is opt-in because an application must apply its own internal/admin authorization policy. Setup-generated composition defaults to `exposeHttp: false`.

## Adding a channel

Email and push contracts/providers are defined, but only Telegram delivery is implemented. To activate another channel:

1. Implement a backend transport strategy that returns `NotificationDeliveryResult`.
2. Register it in `ChannelStrategyResolver`.
3. Add its provider configuration and secret names to the capability catalog.
4. Add provider rejection/retry mapping tests.
5. Add template-content validation and end-to-end delivery tests.

Never mark a delivery sent without calling the provider. Never place provider state on `notifications`, and never add rollout-only dual-write/backfill logic to a new installation.
