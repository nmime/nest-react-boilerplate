import { connect, type NodeConnectionOptions } from "@nats-io/transport-node";
import type { NatsConnection } from "@nats-io/nats-core";
import type { NatsConnectionConfig } from "./type";

export async function createNatsConnection(
  config: NatsConnectionConfig,
): Promise<NatsConnection> {
  return (await connect(toNatsConnectionOptions(config))) as NatsConnection;
}

export function toNatsConnectionOptions(
  config: NatsConnectionConfig,
): NodeConnectionOptions {
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

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
): Promise<T> {
  if (!timeoutMs) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`NATS drain timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}
