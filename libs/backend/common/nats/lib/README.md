# @app/backend-common-nats

## Purpose

Provides a production-ready NATS client wrapper with JetStream, key-value,
Object Store, service registration, health checks, configuration, and Nest
injection helpers.

## Environment Variables

| Variable                      | Required | Description                                                                  |
| ----------------------------- | -------- | ---------------------------------------------------------------------------- |
| `NATS_SERVERS`                | Yes      | Comma-separated NATS server URLs (e.g. `nats://nats:4222,nats://nats2:4222`) |
| `NATS_NAME`                   | No       | Client name for server-side identification                                   |
| `NATS_USER`                   | No       | Username for NATS authentication (use with NATS_PASS)                        |
| `NATS_PASS`                   | No       | Password for NATS authentication (use with NATS_USER)                        |
| `NATS_TOKEN`                  | No       | Token-based authentication (mutually exclusive with USER/PASS)               |
| `NATS_TIMEOUT_MS`             | No       | Connection timeout in milliseconds                                           |
| `NATS_RECONNECT`              | No       | Enable auto-reconnect (default: true)                                        |
| `NATS_MAX_RECONNECT_ATTEMPTS` | No       | Maximum reconnect attempts before giving up                                  |
| `NATS_RECONNECT_TIME_WAIT_MS` | No       | Delay between reconnect attempts                                             |
| `NATS_WAIT_ON_FIRST_CONNECT`  | No       | Block until first connection is established                                  |
| `NATS_PING_INTERVAL_MS`       | No       | Interval for ping/pong keepalive                                             |
| `NATS_DRAIN_TIMEOUT_MS`       | No       | Timeout for graceful drain on shutdown (default: 5000)                       |
| `NATS_JETSTREAM_BUCKET`       | No       | Default JetStream bucket/durable name prefix                                 |

## Quick Start

### Module Registration

```typescript
import { NatsModule } from '@app/backend-common-nats';

@Module({
  imports: [NatsModule.forRoot()],
})
export class AppModule {}
```

Or with explicit configuration:

```typescript
NatsModule.forRoot({
  servers: ['nats://localhost:4222'],
  name: 'my-service',
  reconnect: true,
});
```

### Using NATS Services

```typescript
import { Injectable } from '@nestjs/common';
import { NatsService, NatsJetStreamService, NatsKvService, InjectNatsConnection } from '@app/backend-common-nats';
import type { NatsConnection } from '@nats-io/nats-core';

@Injectable()
export class ExampleService {
  constructor(
    private readonly nats: NatsService,
    private readonly jetstream: NatsJetStreamService,
    private readonly kv: NatsKvService,
    @InjectNatsConnection()
    private readonly connection: NatsConnection | null,
  ) {}

  async publish() {
    this.nats.publishJson('orders.created', { id: 1, total: 99.99 });
  }

  async request() {
    const response = await this.nats.requestJson<string>('orders.get', { id: 1 });
    return response;
  }

  async jetStreamPublish() {
    await this.jetstream.publishJson('orders.stream', { id: 1 });
  }
}
```

### JetStream

```typescript
// Publish to a JetStream stream
await jetstream.publishJson('my.subject', { data: 'value' });

// Get JetStream client for advanced operations
const js = jetstream.getClient();
const streams = await js.getStreamList();
```

### Key-Value Store

```typescript
// Get a KV bucket
const bucket = await kv.getBucket('config');

// Put and get values
await bucket.put('setting.theme', 'dark');
const value = await bucket.get('setting.theme');
```

### Object Store

```typescript
// Get an ObjectStore
const store = await objectStore.getStore('uploads');

// Store an object
await store.put({
  bucket: 'uploads',
  key: 'file.pdf',
  data: pdfBytes,
});

// Retrieve an object
const entry = await store.get('file.pdf');
```

## Connection Configuration

The `NatsConfigService` reads configuration from environment variables
or from explicit options passed to `NatsModule.forRoot()`. Options
take precedence over environment variables.

Authentication modes (mutually exclusive):

1. **Token**: Set `NATS_TOKEN`
2. **User/Pass**: Set both `NATS_USER` and `NATS_PASS`
3. **NKey**: Configure via the underlying NATS client options

If no servers are configured, the module registers a `null` connection
and all services check `isEnabled` before operating.

## Health Checks

```typescript
import { NatsHealthIndicator } from '@app/backend-common-nats';

// In your health check module:
health.check('nats', (health) => health.checkNats('nats'));
```

## Graceful Shutdown

The module registers an `OnApplicationShutdown` hook that drains and
closes the NATS connection gracefully. The drain timeout is controlled
by `NATS_DRAIN_TIMEOUT_MS` (default: 5000ms).

## Commands

```bash
pnpm exec nx run @app/backend-common-nats:build
pnpm exec nx run @app/backend-common-nats:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
