# NATS foundation

`@app/common/nats` provides a backend Nest foundation for NATS without wiring any runtime application to require a broker by default.

It uses the official NATS.js v3 mono-repo packages from [`nats-io/nats.js`](https://github.com/nats-io/nats.js/). The v3 client is split into runtime and feature packages instead of the legacy single `nats` package:

- `@nats-io/transport-node` for the Node/Bun TCP transport and `connect()`.
- `@nats-io/nats-core` for core types such as `Msg`, `PublishOptions`, and `RequestOptions`.
- `@nats-io/jetstream` for JetStream clients and managers.
- `@nats-io/kv` for key-value buckets.
- `@nats-io/obj` for Object Store.
- `@nats-io/services` for NATS services.

`@nats-io/core` is not used because the published official core package is `@nats-io/nats-core`.

## Configuration

The module is disabled when `NATS_SERVERS` is empty. Importing `NatsModule.forRoot()` will then provide a `null` connection, keep `NatsHealthIndicator` healthy with `{ enabled: false }`, and avoid outbound broker connections.

Supported environment variables:

- `NATS_SERVERS`: comma-separated NATS server URLs, for example `nats://nats-a:4222,nats://nats-b:4222`.
- `NATS_NAME`: optional client name.
- `NATS_USER` and `NATS_PASS`: optional username/password authentication; configure both together.
- `NATS_TOKEN`: optional token authentication; mutually exclusive with username/password.
- `NATS_TIMEOUT_MS`: optional connection timeout in milliseconds.
- `NATS_RECONNECT`: optional boolean reconnect toggle.
- `NATS_MAX_RECONNECT_ATTEMPTS`: optional reconnect attempt count; use the official NATS client semantics.
- `NATS_RECONNECT_TIME_WAIT_MS`: optional reconnect wait in milliseconds.
- `NATS_WAIT_ON_FIRST_CONNECT`: optional boolean to wait on the initial connection.
- `NATS_PING_INTERVAL_MS`: optional client ping interval in milliseconds.
- `NATS_DRAIN_TIMEOUT_MS`: optional shutdown drain timeout; defaults to `5000`.

These values are mapped to `NodeConnectionOptions` from `@nats-io/transport-node`.

## Nest module usage

```ts
import { Module } from "@nestjs/common";
import { NatsModule } from "@app/common/nats";

@Module({
  imports: [NatsModule.forRoot()],
})
export class MessagingModule {}
```

Inject `NatsService` for ready-to-use JSON/string Core helpers, or inject the raw connection with `@InjectNatsConnection()` when a feature needs lower-level NATS APIs. `NatsService` throws `NatsConnectionUnavailableError` if a feature tries to publish/request while NATS is disabled, closed, or draining.

`NatsHealthIndicator.check()` uses `flush()` as a lightweight protocol roundtrip and does not publish fake business data. Shutdown uses `drain()` first, then falls back to `close()` if draining times out.

## Core

```ts
import { Injectable } from "@nestjs/common";
import { NatsService } from "@app/common/nats";

@Injectable()
export class UserEvents {
  constructor(private readonly nats: NatsService) {}

  userCreated(userId: string): void {
    this.nats.publishJson("events.user.created", { userId });
  }

  lookupUser(userId: string): Promise<{ ok: boolean }> {
    return this.nats.requestJson(
      "rpc.user.lookup",
      { userId },
      { timeout: 500 },
    );
  }
}
```

NATS.js v3 removed the old codec helpers. Publish strings or bytes directly, use `JSON.stringify(value)` for JSON payloads, and use `msg.string()` or `msg.json<T>()` on received messages.

```ts
import { InjectNatsConnection } from "@app/common/nats";
import type { NatsConnection } from "@nats-io/transport-node";

export class RawCoreExample {
  constructor(
    @InjectNatsConnection() private readonly nc: NatsConnection | null,
  ) {}

  publish(): void {
    if (!this.nc) return;
    this.nc.publish("events.example", JSON.stringify({ ok: true }));
  }
}
```

## JetStream

Use the v3 module functions from `@nats-io/jetstream`; do not call removed connection methods.

```ts
import {
  createJetStream,
  createJetStreamManager,
  InjectNatsConnection,
} from "@app/common/nats";
import type { NatsConnection } from "@nats-io/transport-node";

export class JetStreamExample {
  constructor(
    @InjectNatsConnection() private readonly nc: NatsConnection | null,
  ) {}

  async streams(): Promise<void> {
    if (!this.nc) return;
    const js = createJetStream(this.nc);
    const jsm = await createJetStreamManager(this.nc);
    await jsm.streams.add({ name: "EVENTS", subjects: ["events.>"] });
    await js.publish("events.created", JSON.stringify({ ok: true }));
  }
}
```

## KV

```ts
import {
  createJetStream,
  createKvm,
  InjectNatsConnection,
} from "@app/common/nats";
import type { NatsConnection } from "@nats-io/transport-node";

export class KvExample {
  constructor(
    @InjectNatsConnection() private readonly nc: NatsConnection | null,
  ) {}

  async openBucket(): Promise<void> {
    if (!this.nc) return;
    const kvm = createKvm(createJetStream(this.nc));
    const bucket = await kvm.create("profiles");
    await bucket.put("user-1", JSON.stringify({ name: "Ada" }));
  }
}
```

## Object Store

```ts
import {
  createJetStream,
  createObjm,
  InjectNatsConnection,
} from "@app/common/nats";
import type { NatsConnection } from "@nats-io/transport-node";

export class ObjectStoreExample {
  constructor(
    @InjectNatsConnection() private readonly nc: NatsConnection | null,
  ) {}

  async openStore(): Promise<void> {
    if (!this.nc) return;
    const objm = createObjm(createJetStream(this.nc));
    const store = await objm.create("files");
    await store.put({ name: "readme.txt" }, "hello");
  }
}
```

## Services

The published services manager export is `Svcm` from `@nats-io/services`; `@app/common/nats` exposes `createServices(nc)`.

```ts
import { createServices, InjectNatsConnection } from "@app/common/nats";
import type { NatsConnection } from "@nats-io/transport-node";

export class ServicesExample {
  constructor(
    @InjectNatsConnection() private readonly nc: NatsConnection | null,
  ) {}

  async start(): Promise<void> {
    if (!this.nc) return;
    const services = createServices(this.nc);
    const service = await services.add({ name: "math", version: "1.0.0" });
    service.addEndpoint("sum", (err, msg) => {
      if (err) return;
      const request = msg.json<{ a: number; b: number }>();
      msg.respond(JSON.stringify({ result: request.a + request.b }));
    });
  }
}
```
