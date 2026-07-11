import { connect, type NodeConnectionOptions } from '@nats-io/transport-node';
import type { NatsConnection } from '@nats-io/nats-core';
import type { NatsConnectionConfig } from './type';
import { stripUndefined, withTimeout } from './util';

export async function createNatsConnection(config: NatsConnectionConfig): Promise<NatsConnection> {
  return await connect(toNatsConnectionOptions(config));
}

export function toNatsConnectionOptions(config: NatsConnectionConfig): NodeConnectionOptions {
  return stripUndefined({
    servers: config.servers,
    name: config.name,
    user: config.user,
    pass: config.pass,
    token: config.token,
    timeout: config.timeoutMs,
    reconnect: config.reconnect,
    maxReconnectAttempts: config.maxReconnectAttempts,
    reconnectTimeWait: config.reconnectTimeWaitMs,
    waitOnFirstConnect: config.waitOnFirstConnect,
    pingInterval: config.pingIntervalMs,
  });
}

export async function closeNatsConnection(
  connection: NatsConnection,
  options: { drainTimeoutMs?: number } = {},
): Promise<void> {
  if (connection.isClosed()) {
    return;
  }

  try {
    if (connection.isDraining()) {
      await withTimeout(connection.closed(), options.drainTimeoutMs);
      return;
    }

    await withTimeout(connection.drain(), options.drainTimeoutMs);
  } catch {
    if (!connection.isClosed()) {
      await connection.close().catch(() => undefined);
    }
  }
}
