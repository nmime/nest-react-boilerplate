import type { JetStreamClient, JetStreamManager } from "@nats-io/jetstream";
import type { Kvm } from "@nats-io/kv";
import type { NatsConnection } from "@nats-io/nats-core";
import type { Objm } from "@nats-io/obj";
import type { Svcm } from "@nats-io/services";
import type { NatsJetStreamOptions } from "../nats-jetstream.factory";

export interface NatsConnectionConfig {
  servers: string[];
  name?: string;
  user?: string;
  pass?: string;
  token?: string;
  timeoutMs?: number;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectTimeWaitMs?: number;
  waitOnFirstConnect?: boolean;
  pingIntervalMs?: number;
}

export type NatsConnectionFactory = (
  config: NatsConnectionConfig,
) => Promise<NatsConnection>;

export type NatsJetStreamFactory = (
  connection: NatsConnection,
  options?: NatsJetStreamOptions,
) => JetStreamClient;

export type NatsJetStreamManagerFactory = (
  connection: NatsConnection,
  options?: NatsJetStreamOptions,
) => Promise<JetStreamManager>;

export type NatsKvManagerFactory = (connection: NatsConnection) => Kvm;

export type NatsObjectStoreManagerFactory = (
  connection: NatsConnection,
) => Objm;

export type NatsServiceManagerFactory = (connection: NatsConnection) => Svcm;

export interface NatsConfig extends Partial<NatsConnectionConfig> {
  client?: NatsConnection | null;
  connectionFactory?: NatsConnectionFactory;
  jetStreamOptions?: NatsJetStreamOptions;
  jetStreamFactory?: NatsJetStreamFactory;
  jetStreamManagerFactory?: NatsJetStreamManagerFactory;
  kvManagerFactory?: NatsKvManagerFactory;
  objectStoreManagerFactory?: NatsObjectStoreManagerFactory;
  serviceManagerFactory?: NatsServiceManagerFactory;
  drainTimeoutMs?: number;
}
