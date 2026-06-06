import { Objm } from "@nats-io/obj";
import type { JetStreamClient } from "@nats-io/jetstream";
import type { NatsConnection } from "@nats-io/nats-core";

export type NatsObjectStoreSource = NatsConnection | JetStreamClient;

export function createObjm(source: NatsObjectStoreSource): Objm {
  return new Objm(source);
}
