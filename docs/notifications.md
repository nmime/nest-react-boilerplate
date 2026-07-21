# Notifications

The notification capability is a PostgreSQL-backed event feed plus delivery queue. This clean-install template has no legacy columns, dual writes, backfill jobs, or fallback reads.

## Ownership

| Project                                    | Responsibility                                                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@app/common-notifications`                | Framework-neutral enums and immutable event, template, delivery, error, and channel-content contracts.                                                    |
| `@app/backend-feature-notification-shared` | Application service, request DTOs, persistence and recipient-resolution ports, and domain errors. It never imports MikroORM.                              |
| `@app/backend-postgres-main-notification`  | MikroORM entities, migrations, transactions, template replacement, queue queries, result persistence, encrypted sensitive payloads, and retry scheduling. |
| `@app/backend-feature-notification-main`   | Nest composition, optional HTTP controller, message rendering, provider strategies, scheduler, health, and partition maintenance.                         |
| `notification-scheduler`                   | Dedicated scheduled-job deployable that claims and sends queue deliveries. It has no public HTTP surface.                                                 |

## Data model

`notifications` is the immutable user-facing event/feed record. It stores target, template, ordinary template data, extra, `in_app_visible`, and creation time. It does not store transport status, channel, attempts, errors, priority, or scheduling. Confidential values (for example confirmation codes and bearer links) are stored separately in AES-256-GCM encrypted `sensitive_data`, authenticated to the notification id and target; only the delivery scheduler decrypts them to render a delivery.

`notification_deliveries` is the only transport queue. Each row owns channel, provider, status, attempts, error, priority, `send_after`, `sent_at`, timestamps, and denormalized target identity. It is range-partitioned by `created_at`; the baseline migration creates the current and next six monthly partitions, while the scheduler maintains future partitions.

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

Dependency expansion selects PostgreSQL and `notification-scheduler`. Setup writes the selected module composition into each backend app's `capabilities.generated.ts`; APIs receive producer-only notification composition and only the scheduler claims queue rows. Removing the capability and rerunning setup removes those generated imports. Product-owned API modules do not import `NotificationMainModule` directly.

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
  deliveries: [{ channel: NotificationChannel.Bot, provider: NotificationDeliveryProvider.TelegramBot }],
  inAppVisible: true,
  data: { displayName },
});
```

When `exposeHttp` is deliberately enabled, the equivalent endpoints are:

- `PUT /api/v1/notifications/templates`
- `POST /api/v1/notifications`
- `POST /api/v1/notifications/batch`

HTTP exposure is opt-in because an application must apply its own internal/admin authorization policy. Setup-generated composition defaults to `exposeHttp: false`.

## Providers and authentication delivery

The delivered providers are deliberately concrete and immutable per delivery:

- `TelegramBotNotificationProvider` sends bot-channel confirmation codes to linked Telegram identities or explicit Telegram chats.
- `DiscordBotNotificationProvider` creates a DM channel and sends bot-channel confirmation codes to linked Discord identities.
- `ResendEmailNotificationProvider` and `MailPaceEmailNotificationProvider` send email-channel messages. Resend receives a stable queue idempotency key.

`AUTH_NOTIFICATION_PROVIDER` selects where this project's own verification and reset codes go: `telegram-bot`, `discord-bot`, `resend`, or `mailpace`. `NOTIFICATION_EMAIL_PROVIDER` selects the email route used by Better Auth's verification/reset links (`resend` by default). Both flows publish through `NotificationService`; no auth bearer credential is logged or persisted in plaintext.

Configure the selected provider only in the scheduler, plus the shared `NOTIFICATION_PAYLOAD_ENCRYPTION_KEY` in every producer and the scheduler. Production Compose reads the key and provider credentials from Docker secrets: `notification_payload_encryption_key`, `resend_api_key`, and `mailpace_server_token`; bot credentials reuse the Telegram and Discord bot secrets. The encryption key must be 32 bytes, supplied as 64 hex characters or base64.

## Extending providers

Apple APNs and Google FCM are reserved concrete provider identifiers (`apple-apns`, `google-fcm`) rather than generic channel aliases. Add either by implementing `NotificationProviderStrategy`, registering it in `NotificationProviderResolver`, adding its configuration/secrets and failure mapping, then covering it with provider-level tests. Do not silently fall back to another provider on retry.

Never mark a delivery sent without calling the provider. Never place provider state on `notifications`, and never add rollout-only dual-write/backfill logic to a new installation.
