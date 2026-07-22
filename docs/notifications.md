# Notifications

The notification capability is a PostgreSQL-backed event feed plus delivery queue. This clean-install template has no legacy columns, dual writes, backfill jobs, or fallback reads.

## Ownership

| Project                                    | Responsibility                                                                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@app/common-notifications`                | Framework-neutral event, template-version, segment, snapshot, broadcast, delivery, error, and channel-content contracts.                                                     |
| `@app/backend-feature-notification-shared` | Application and persistence ports plus recipient and segment resolver contracts. It never imports MikroORM.                                                                  |
| `@app/backend-postgres-main-notification`  | Tenant-scoped MikroORM entities, migrations, transactions, immutable versions, snapshots, command leases, queue queries, encrypted payloads, and retry scheduling.           |
| `@app/backend-feature-notification-main`   | Nest composition, admin orchestration, safe rendering, CSV validation, provider strategies, consumer and scheduler loops, health, and partition maintenance.                 |
| `admin-app-api`                            | Authenticated, permission-gated template, segment, upload, and broadcast commands. It never loops through audiences or calls a provider.                                     |
| `notification-consumer`                    | Headless consumer that validates pending CSV uploads, resolves exact audience snapshots, and materializes notification/delivery rows in bounded idempotent chunks.           |
| `notification-scheduler`                   | Headless scheduled-job process that activates scheduled broadcasts, claims eligible delivery rows, invokes their immutable provider strategy, and persists provider results. |

## Data model

`notifications` is the immutable user-facing event/feed record. It stores target, template, ordinary template data, extra, `in_app_visible`, and creation time. It does not store transport status, channel, attempts, errors, priority, or scheduling. Confidential values (for example confirmation codes and bearer links) are stored separately in AES-256-GCM encrypted `sensitive_data`, authenticated to the notification id and target; only the delivery scheduler decrypts them to render a delivery.

`notification_deliveries` is the only transport queue. Each row owns channel,
provider, status, attempts, error, priority, `send_after`, `sent_at`, timestamps,
and denormalized target identity. A delivery may also point to the immutable
template version and broadcast that created it. It is range-partitioned by
`created_at`; the baseline migration creates the current and next six monthly
partitions, while the scheduler maintains future partitions.

`notification_templates` owns stable identity, source (`code` or `admin`),
tenant scope, and lifecycle. Published content is immutable in
`notification_template_versions` and
`notification_template_version_channels`. Code-owned upserts create a new
version only when normalized content changes. In-app is template/event content,
not a queue delivery.

Admin broadcasts bind one published version, one explicit channel/provider,
and an OR-union of selected segments. The consumer materializes a fixed,
deduplicated audience snapshot before sending. Snapshot-member and delivery
uniqueness constraints make collection and materialization retry-safe.

Delivery states are:

- `pending`: ready now or scheduled for retry via `send_after`.
- `sent`: provider accepted the message.
- `rejected`: permanent recipient/provider rejection such as blocked bot or missing chat.
- `error`: non-retryable internal/unknown failure.
- `paused`: retained pending work for a paused broadcast.
- `cancelled`: terminal unsent work for a cancelled broadcast.

Retryable provider rate limits, network failures, and gateway failures return to
`pending`. Provider `Retry-After` metadata is honored; otherwise PostgreSQL
applies exponential delay starting at 30 seconds and capped at 30 minutes.

## Activating the capability

```bash
pnpm nrb setup --capability notifications --non-interactive
pnpm run docker:selected
```

Dependency expansion selects PostgreSQL, S3, `notification-consumer`, and
`notification-scheduler`. Setup writes the selected module composition into each
backend app's `capabilities.generated.ts`. APIs receive producer-only
composition, the consumer owns audience work, and only the scheduler claims and
sends deliveries. Removing the capability and rerunning setup removes those
generated imports. Product-owned API modules do not import
`NotificationMainModule` directly.

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

## Admin broadcasts

The admin panel exposes:

- `/admin/notifications/templates` for localized drafts, preview, test send,
  immutable publication, and archive;
- `/admin/notifications/segments` for static CSV or registered dynamic
  audiences, estimates, upload validation, and archive;
- `/admin/notifications/broadcasts` for exact audience collection, independent
  approval, send/schedule, pause/resume/cancel, and durable statistics.

The admin API is tenant-scoped and protected by separate read, write, test-send,
send, and approve permissions. Production enables two-person approval by
default. Every state-changing command uses an `Idempotency-Key`; state conflicts
return RFC 9457 problems instead of repeating work.

Static CSV imports accept UTF-8 `target_id`, optional `target_type` and
`language`, and additional per-recipient variable columns. The API bounds and
checks the decoded upload before placing it in S3; the consumer performs the
durable validation/import and atomically replaces segment membership only on
success. The current HTTP contract uses a base64 JSON body rather than a
multipart stream, so keep `NOTIFICATION_CSV_MAX_BYTES` conservative.

The full product/technical contract and product-specific category extension
points are documented in
[Admin notification broadcasts](admin-notification-broadcasts-spec.md).

## Providers and authentication delivery

The delivered providers are deliberately concrete and immutable per delivery:

- `TelegramBotNotificationProvider` sends HTML text/photo notifications with
  localized keyboards, buttons, link-preview controls, custom emoji, silent
  delivery, rate-limit metadata, and permanent recipient error mapping.
- `DiscordBotNotificationProvider` creates a DM channel and sends safe content,
  embeds, components, buttons, images, silent delivery, and constrained allowed
  mentions.
- `ResendEmailNotificationProvider` and `MailPaceEmailNotificationProvider`
  send localized text/HTML email and attachments with stable per-delivery
  idempotency and retry metadata.
- `GoogleFcmNotificationProvider` signs a service-account assertion, caches its
  OAuth access token, and sends a Firebase HTTP v1 message to an explicit device
  token.
- `AppleApnsNotificationProvider` signs an ES256 provider token and sends the
  APNs HTTP/2 request to an explicit device token and bundle topic.

`AUTH_NOTIFICATION_PROVIDER` selects where verification and reset codes go: `telegram-bot`, `discord-bot`, `resend`, or `mailpace`. When it is omitted, `NOTIFICATION_EMAIL_PROVIDER` selects the default email route (`resend` by default). The canonical auth flow publishes through `NotificationService`; no credential is logged or persisted in plaintext.

Configure provider credentials only in the scheduler, plus the shared
`NOTIFICATION_PAYLOAD_ENCRYPTION_KEY` in every producer, consumer, and scheduler.
Production Compose reads the encryption key, email tokens, and FCM/APNs private
keys from Docker secrets; bot credentials reuse the Telegram and Discord bot
secrets. The encryption key must decode to exactly 32 bytes, supplied as 64 hex
characters or base64.

## Extending providers

Every transport implements `NotificationProviderStrategy` and is selected by
`NotificationProviderResolver` from the delivery's explicit provider. Add a
provider by registering one concrete identifier, configuration/secrets,
capability checks, failure classification, and provider-level tests. Do not
silently fall back to another provider on retry.

Never mark a delivery sent without calling the provider. Never place provider state on `notifications`, and never add rollout-only dual-write/backfill logic to a new installation.
