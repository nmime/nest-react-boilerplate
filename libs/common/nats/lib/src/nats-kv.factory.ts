import { Kvm, type KV, type KvOptions } from "@nats-io/kv";
import type { NatsConnection } from "@nats-io/nats-core";
import type { JetStreamClient } from "@nats-io/jetstream";

export type NatsKvSource = NatsConnection | JetStreamClient;

export function createNatsKvManager(source: NatsKvSource): Kvm {
  return new Kvm(source);
}

export async function createNatsKeyValueStore(
  source: NatsKvSource,
  bucket: string,
  options?: Partial<KvOptions>,
): Promise<KV> {
  return await createNatsKvManager(source).create(bucket, options);
}

export async function openNatsKeyValueStore(
  source: NatsKvSource,
  bucket: string,
  options?: Partial<KvOptions>,
): Promise<KV> {
  return await createNatsKvManager(source).open(bucket, options);
}
