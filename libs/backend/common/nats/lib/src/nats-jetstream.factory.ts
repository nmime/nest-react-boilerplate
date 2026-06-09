import {
  jetstream,
  jetstreamManager,
  type JetStreamClient,
  type JetStreamManager,
  type JetStreamManagerOptions,
  type JetStreamOptions,
} from "@nats-io/jetstream";
import type { NatsConnection } from "@nats-io/nats-core";

export function createJetStream(
  connection: NatsConnection,
  options: JetStreamOptions = {},
): JetStreamClient {
  return jetstream(connection, options);
}

export async function createJetStreamManager(
  connection: NatsConnection,
  options: JetStreamOptions | JetStreamManagerOptions = {},
): Promise<JetStreamManager> {
  return await jetstreamManager(connection, options);
}
