import type { JetStreamClient } from "@nats-io/jetstream";
import type { NatsConnection } from "@nats-io/nats-core";
import { Objm, type ObjectStore, type ObjectStoreOptions } from "@nats-io/obj";

export type NatsObjectStoreSource = NatsConnection | JetStreamClient;

export function createNatsObjectStoreManager(
  source: NatsObjectStoreSource,
): Objm {
  return new Objm(source);
}

export async function createNatsObjectStore(
  source: NatsObjectStoreSource,
  bucket: string,
  options?: Partial<ObjectStoreOptions>,
): Promise<ObjectStore> {
  return await createNatsObjectStoreManager(source).create(bucket, options);
}

export async function openNatsObjectStore(
  source: NatsObjectStoreSource,
  bucket: string,
  options?: boolean | { check?: boolean; timeout?: number },
): Promise<ObjectStore> {
  return await createNatsObjectStoreManager(source).open(bucket, options);
}
