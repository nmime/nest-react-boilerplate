import { Kvm } from "@nats-io/kv";
import type { JetStreamClient } from "@nats-io/jetstream";
import type { NatsConnection } from "@nats-io/nats-core";

export type NatsKvSource = NatsConnection | JetStreamClient;

export function createKvm(source: NatsKvSource): Kvm {
  return new Kvm(source);
}
