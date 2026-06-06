# NATS foundation

`@app/common/nats` provides a minimal backend Nest foundation for NATS without wiring any runtime application to require a broker by default.

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

## Usage

```ts
import { Module } from "@nestjs/common";
import { NatsModule } from "@app/common/nats";

@Module({
  imports: [NatsModule.forRoot()],
})
export class MessagingModule {}
```

Inject `NatsService` for typed JSON publish/request helpers, or inject the raw connection with `@InjectNatsConnection()` when a feature needs lower-level NATS APIs. `NatsService` throws `NatsConnectionUnavailableError` if a feature tries to publish/request while NATS is disabled, closed, or draining.

`NatsHealthIndicator.check()` uses `flush()` as a lightweight protocol roundtrip and does not publish fake business data. Shutdown uses `drain()` first, then falls back to `close()` if draining times out.
