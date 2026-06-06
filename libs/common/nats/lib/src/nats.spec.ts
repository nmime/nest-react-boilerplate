import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSONCodec, type Msg, type NatsConnection } from "nats";
import { NatsConfigService } from "./config";
import {
  closeNatsConnection,
  createNatsConnection,
  toNatsConnectionOptions,
} from "./nats-client.factory";
import { NatsHealthIndicator } from "./nats.health";
import { NatsConnectionUnavailableError, NatsService } from "./nats.service";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("nats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nats")>();
  return {
    ...actual,
    connect: mocks.connect,
  };
});

const NATS_ENV_KEYS = [
  "NATS_SERVERS",
  "NATS_NAME",
  "NATS_USER",
  "NATS_PASS",
  "NATS_TOKEN",
  "NATS_TIMEOUT_MS",
  "NATS_RECONNECT",
  "NATS_MAX_RECONNECT_ATTEMPTS",
  "NATS_RECONNECT_TIME_WAIT_MS",
  "NATS_WAIT_ON_FIRST_CONNECT",
  "NATS_PING_INTERVAL_MS",
  "NATS_DRAIN_TIMEOUT_MS",
] as const;

describe("NATS foundation", () => {
  const originalEnvironment = Object.fromEntries(
    NATS_ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  beforeEach(() => {
    mocks.connect.mockReset();
    for (const key of NATS_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of NATS_ENV_KEYS) {
      const value = originalEnvironment[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("keeps NATS disabled when no servers are configured", () => {
    const config = new NatsConfigService();

    expect(config.connectionConfig).toBeUndefined();
    expect(config.drainTimeoutMs).toBe(5000);
  });

  it("builds connection config from environment variables", () => {
    process.env.NATS_SERVERS = "nats://nats-a:4222, nats://nats-b:4222";
    process.env.NATS_NAME = "backend-api";
    process.env.NATS_USER = "app";
    process.env.NATS_PASS = "secret";
    process.env.NATS_TIMEOUT_MS = "1500";
    process.env.NATS_RECONNECT = "false";
    process.env.NATS_MAX_RECONNECT_ATTEMPTS = "3";
    process.env.NATS_RECONNECT_TIME_WAIT_MS = "250";
    process.env.NATS_WAIT_ON_FIRST_CONNECT = "true";
    process.env.NATS_PING_INTERVAL_MS = "30000";
    process.env.NATS_DRAIN_TIMEOUT_MS = "7500";

    const config = new NatsConfigService();

    expect(config.connectionConfig).toEqual({
      servers: ["nats://nats-a:4222", "nats://nats-b:4222"],
      name: "backend-api",
      user: "app",
      pass: "secret",
      token: undefined,
      timeoutMs: 1500,
      reconnect: false,
      maxReconnectAttempts: 3,
      reconnectTimeWaitMs: 250,
      waitOnFirstConnect: true,
      pingIntervalMs: 30000,
    });
    expect(config.drainTimeoutMs).toBe(7500);
  });

  it("rejects mutually exclusive NATS authentication settings", () => {
    const config = new NatsConfigService({
      servers: ["nats://nats:4222"],
      token: "token",
      user: "user",
      pass: "pass",
    });

    expect(() => config.connectionConfig).toThrow(
      "NATS_TOKEN is mutually exclusive with NATS_USER/NATS_PASS.",
    );
  });

  it("maps local config names to official nats connection options", () => {
    expect(
      toNatsConnectionOptions({
        servers: ["nats://nats:4222"],
        name: "api",
        token: "token",
        timeoutMs: 1000,
        reconnect: true,
        maxReconnectAttempts: -1,
        reconnectTimeWaitMs: 500,
        waitOnFirstConnect: true,
        pingIntervalMs: 10000,
      }),
    ).toEqual({
      servers: ["nats://nats:4222"],
      name: "api",
      token: "token",
      timeout: 1000,
      reconnect: true,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 500,
      waitOnFirstConnect: true,
      pingInterval: 10000,
    });
  });

  it("creates a NATS connection with the official nats client", async () => {
    const connection = natsConnection();
    mocks.connect.mockResolvedValue(connection);

    await expect(
      createNatsConnection({
        servers: ["nats://nats:4222"],
        name: "api",
      }),
    ).resolves.toBe(connection);

    expect(mocks.connect).toHaveBeenCalledWith({
      servers: ["nats://nats:4222"],
      name: "api",
    });
  });

  it("publishes and requests typed JSON payloads", async () => {
    const codec = JSONCodec<{ ok: boolean }>();
    const response = { data: codec.encode({ ok: true }) } as Msg;
    const request = vi.fn(() => Promise.resolve(response));
    const publish = vi.fn();
    const connection = natsConnection({ publish, request });
    const service = new NatsService(connection);

    service.publishJson("events.user.created", { userId: "user-1" });
    await expect(
      service.requestJson<{ ok: boolean }, { userId: string }>(
        "rpc.user.lookup",
        { userId: "user-1" },
        { timeout: 250 },
      ),
    ).resolves.toEqual({ ok: true });

    expect(publish).toHaveBeenCalledWith(
      "events.user.created",
      expect.any(Uint8Array),
      undefined,
    );
    const firstPublishCall = publish.mock.calls[0] as
      | [string, Uint8Array | undefined, unknown]
      | undefined;
    const publishedPayload = firstPublishCall?.[1];
    if (!(publishedPayload instanceof Uint8Array)) {
      throw new TypeError("Expected NATS publish payload to be bytes.");
    }

    expect(JSONCodec<{ userId: string }>().decode(publishedPayload)).toEqual({
      userId: "user-1",
    });
    expect(request).toHaveBeenCalledWith(
      "rpc.user.lookup",
      expect.any(Uint8Array),
      { timeout: 250 },
    );
  });

  it("does not allow publishing when NATS is not configured", () => {
    const service = new NatsService(null);

    expect(() => service.publishJson("events", {})).toThrow(
      NatsConnectionUnavailableError,
    );
  });

  it("checks NATS health with flush and without publishing fake data", async () => {
    const flush = vi.fn(() => Promise.resolve(undefined));
    const publish = vi.fn();
    const connection = natsConnection({ flush, publish });
    const health = new NatsHealthIndicator(connection);

    await expect(health.check()).resolves.toEqual({
      name: "nats",
      status: "ok",
      details: { enabled: true, server: "nats://nats:4222" },
    });

    expect(flush).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it("reports disabled health as ok for config-disabled apps", async () => {
    await expect(new NatsHealthIndicator(null).check()).resolves.toEqual({
      name: "nats",
      status: "ok",
      details: { enabled: false },
    });
  });

  it("drains NATS connections during shutdown", async () => {
    const drain = vi.fn(() => Promise.resolve(undefined));
    const close = vi.fn(() => Promise.resolve(undefined));
    const connection = natsConnection({ drain, close });

    await closeNatsConnection(connection, { drainTimeoutMs: 100 });

    expect(drain).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });
});

function natsConnection(
  overrides: Partial<NatsConnection> = {},
): NatsConnection {
  const connection = {
    closed: vi.fn(() => Promise.resolve(undefined)),
    close: vi.fn(() => Promise.resolve(undefined)),
    publish: vi.fn(),
    request: vi.fn(),
    flush: vi.fn(() => Promise.resolve(undefined)),
    drain: vi.fn(() => Promise.resolve(undefined)),
    isClosed: vi.fn(() => false),
    isDraining: vi.fn(() => false),
    getServer: vi.fn(() => "nats://nats:4222"),
    ...overrides,
  };

  return connection as unknown as NatsConnection;
}
