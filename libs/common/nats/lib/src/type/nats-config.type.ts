import type { NatsConnection } from "@nats-io/nats-core";

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

export interface NatsConfig extends Partial<NatsConnectionConfig> {
  client?: NatsConnection | null;
  connectionFactory?: NatsConnectionFactory;
  drainTimeoutMs?: number;
}
