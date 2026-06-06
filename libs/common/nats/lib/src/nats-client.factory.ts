import type {
  Codec,
  ConnectionOptions,
  NatsConnection,
} from "@nats-io/nats-core";
import { connect } from "@nats-io/transport-node";
import type { NatsConnectionConfig } from "./type";

export type { Codec, NatsConnection } from "@nats-io/nats-core";

export function createNatsJsonCodec<T = unknown>(): Codec<T> {
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  return {
    encode(value: T): Uint8Array {
      return textEncoder.encode(JSON.stringify(value));
    },
    decode(bytes: Uint8Array): T {
      return JSON.parse(textDecoder.decode(bytes)) as T;
    },
  };
}

export function createNatsStringCodec(): Codec<string> {
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  return {
    encode(value: string): Uint8Array {
      return textEncoder.encode(value);
    },
    decode(bytes: Uint8Array): string {
      return textDecoder.decode(bytes);
    },
  };
}

export async function createNatsConnection(
  config: NatsConnectionConfig,
): Promise<NatsConnection> {
  return await connect(toNatsConnectionOptions(config));
}

export function toNatsConnectionOptions(
  config: NatsConnectionConfig,
): ConnectionOptions {
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
