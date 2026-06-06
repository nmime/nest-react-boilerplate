# NATS foundation

`@app/common/nats` provides a backend Nest foundation for the official NATS JavaScript v3 mono-repo without wiring any runtime application to require a broker by default.

The implementation follows [`nats-io/nats.js`](https://github.com/nats-io/nats.js/) v3 and uses the official npm modules:

- `@nats-io/transport-node` for the Node/Bun TCP transport and `connect()`.
- `@nats-io/nats-core` for the transport-agnostic Core `NatsConnection`, publish, subscribe, request/reply, connection lifecycle, headers, and shared types.
- `@nats-io/jetstream` for `jetstream(nc)` and `jetstreamManager(nc)`.
- `@nats-io/kv` for `Kvm`, NATS KV stores, and KV codecs.
- `@nats-io/obj` for `Objm` and NATS Object Store.
- `@nats-io/services` for `Svcm` and NATS Services.

`@app/common/nats` uses the v3 mono-repo modules directly instead of the previous single-package client.

## Configuration

The module is disabled when `NATS_SERVERS` is empty. Importing `NatsModule.forRoot()` will then provide a `null` core connection and `null` JetStream/KV/Object Store/Services managers, keep `NatsHealthIndicator` healthy with `{ enabled: false }`, and avoid outbound broker connections.

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

## Nest module usage

```ts
import { Module } from "@nestjs/common";
import { NatsModule } from "@app/common/nats";

@Module({
  imports: [NatsModule.forRoot()],
})
export class MessagingModule {}
```

Inject `NatsService` for typed Core JSON publish/request helpers, or inject the raw Core connection with `@InjectNatsConnection()` when a feature needs lower-level `@nats-io/nats-core` APIs. `NatsService` throws `NatsConnectionUnavailableError` if a feature tries to publish/request while NATS is disabled, closed, or draining.

`NatsHealthIndicator.check()` uses `flush()` as a lightweight protocol roundtrip and does not publish fake business data. Shutdown uses `drain()` first, then falls back to `close()` if draining times out.

## Core NATS examples

```ts
import {
  InjectNatsConnection,
  NatsService,
  type NatsConnection,
} from "@app/common/nats";

export class UserEvents {
  constructor(
    private readonly nats: NatsService,
    @InjectNatsConnection() private readonly nc: NatsConnection | null,
  ) {}

  publishUserCreated(userId: string): void {
    this.nats.publishJson("events.user.created", { userId });
  }

  async lookupUser(userId: string): Promise<{ name: string }> {
    return await this.nats.requestJson<{ name: string }, { userId }>(
      "rpc.user.lookup",
      { userId },
      { timeout: 500 },
    );
  }
}
```

Codec helpers are exported for modules that need direct Core payload encoding:

```ts
import { createNatsJsonCodec, createNatsStringCodec } from "@app/common/nats";

const jsonCodec = createNatsJsonCodec<{ userId: string }>();
const stringCodec = createNatsStringCodec();
```

## JetStream

`NatsModule` creates injectable JetStream providers when a connection is enabled. They are `null` when NATS is disabled.

```ts
import {
  InjectNatsJetStream,
  InjectNatsJetStreamManager,
} from "@app/common/nats";
import type { JetStreamClient, JetStreamManager } from "@nats-io/jetstream";

export class Streams {
  constructor(
    @InjectNatsJetStream() private readonly js: JetStreamClient | null,
    @InjectNatsJetStreamManager()
    private readonly jsm: JetStreamManager | null,
  ) {}

  async ensureStream(): Promise<void> {
    await this.jsm?.streams.add({ name: "EVENTS", subjects: ["events.>"] });
  }
}
```

Factory helpers are also exported:

```ts
import {
  createNatsJetStream,
  createNatsJetStreamManager,
} from "@app/common/nats";

const js = createNatsJetStream(nc);
const jsm = await createNatsJetStreamManager(nc);
```

## KV

```ts
import { InjectNatsKvManager, openNatsKeyValueStore } from "@app/common/nats";
import type { Kvm } from "@nats-io/kv";

export class SettingsStore {
  constructor(@InjectNatsKvManager() private readonly kvm: Kvm | null) {}

  async getStore() {
    if (!this.kvm) return null;
    return await this.kvm.open("settings");
  }
}

const kv = await openNatsKeyValueStore(nc, "settings");
```

Use `createNatsKeyValueStore(nc, "settings", options)` when the bucket should be created or opened if it already exists.

## Object Store

```ts
import {
  InjectNatsObjectStoreManager,
  createNatsObjectStore,
  openNatsObjectStore,
} from "@app/common/nats";
import type { Objm } from "@nats-io/obj";

export class DocumentObjects {
  constructor(
    @InjectNatsObjectStoreManager() private readonly objm: Objm | null,
  ) {}

  async getStore() {
    return await this.objm?.open("documents");
  }
}

const objectStore = await createNatsObjectStore(nc, "documents");
const existingObjectStore = await openNatsObjectStore(nc, "documents", false);
```

## Services

```ts
import { InjectNatsServiceManager, addNatsService } from "@app/common/nats";
import type { Svcm } from "@nats-io/services";

export class MathServiceRegistration {
  constructor(@InjectNatsServiceManager() private readonly svcm: Svcm | null) {}

  async register(): Promise<void> {
    const service = await this.svcm?.add({ name: "math", version: "1.0.0" });
    service?.addEndpoint("max", (error, message) => {
      if (error || !message) return;
      const numbers = message.json<number[]>();
      message.respond(JSON.stringify(Math.max(...numbers)));
    });
  }
}

const service = await addNatsService(nc, { name: "math", version: "1.0.0" });
```
