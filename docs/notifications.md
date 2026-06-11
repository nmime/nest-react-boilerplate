# Notification and email provider abstraction

`@app/common/notifications` defines the email provider contract used by product features. The current package ships low-risk `NoopEmailProvider` and `InMemoryEmailProvider` implementations for local development and tests.

## API

```ts
import {
  NoopEmailProvider,
  type EmailProvider,
} from "@app/common/notifications";

const email: EmailProvider = new NoopEmailProvider();
await email.send({
  to: [{ email: "user@example.com", name: "User" }],
  subject: "Welcome",
  text: "Thanks for joining.",
  tags: ["onboarding"],
});
```

## Provider readiness checklist

- [ ] Provider handles retries and idempotency keys outside request/response controllers.
- [ ] Bounce, complaint, and unsubscribe events have an ingestion plan.
- [ ] Templates are versioned and previewable.
- [ ] PII and secrets are redacted from logs.
- [ ] Test/dev defaults use `NoopEmailProvider` or `InMemoryEmailProvider` so local commands never send real email accidentally.
