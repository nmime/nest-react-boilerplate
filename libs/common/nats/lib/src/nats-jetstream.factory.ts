import {
  jetstream,
  jetstreamManager,
  type JetStreamClient,
  type JetStreamManager,
  type JetStreamManagerOptions,
  type JetStreamOptions,
} from "@nats-io/jetstream";
import type { NatsConnection } from "@nats-io/nats-core";

export type NatsJetStreamOptions = JetStreamOptions | JetStreamManagerOptions;

export function createNatsJetStream(
  connection: NatsConnection,
  options?: NatsJetStreamOptions,
): JetStreamClient {
  return jetstream(connection, options);
}

export async function createNatsJetStreamManager(
  connection: NatsConnection,
  options?: NatsJetStreamOptions,
): Promise<JetStreamManager> {
  return await jetstreamManager(connection, options);
}
