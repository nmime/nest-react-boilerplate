import { Test } from "@nestjs/testing";
import type { TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Msg, NatsConnection } from "@nats-io/nats-core";
import type { JetStreamClient, JetStreamManager } from "@nats-io/jetstream";
import type { Kvm } from "@nats-io/kv";
import type { Objm } from "@nats-io/obj";
import type { Svcm } from "@nats-io/services";
import { NatsConfigService } from "./config";
import {
  NatsInjectToken,
  NatsJetStreamInjectToken,
  NatsJetStreamManagerInjectToken,
  NatsKvManagerInjectToken,
  NatsObjectStoreManagerInjectToken,
  NatsServiceManagerInjectToken,
} from "./const";
import {
  closeNatsConnection,
  createNatsConnection,
  createNatsJsonCodec,
  createNatsStringCodec,
  toNatsConnectionOptions,
} from "./nats-client.factory";
import {
  createNatsJetStream,
  createNatsJetStreamManager,
} from "./nats-jetstream.factory";
import {
  createNatsKeyValueStore,
  createNatsKvManager,
  openNatsKeyValueStore,
} from "./nats-kv.factory";
import {
  createNatsObjectStore,
  createNatsObjectStoreManager,
  openNatsObjectStore,
} from "./nats-object-store.factory";
import {
  addNatsService,
  createNatsServiceManager,
} from "./nats-services.factory";
import { NatsHealthIndicator } from "./nats.health";
import { NatsModule } from "./nats.module";
import { NatsConnectionUnavailableError, NatsService } from "./nats.service";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  jetstream: vi.fn(),
  jetstreamManager: vi.fn(),
  kvmConstructor: vi.fn(),
  objmConstructor: vi.fn(),
  svcmConstructor: vi.fn(),
}));

vi.mock("@nats-io/transport-node", () => ({
  connect: mocks.connect,
}));

vi.mock("@nats-io/jetstream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nats-io/jetstream")>();
  return {
    ...actual,
    jetstream: mocks.jetstream,
    jetstreamManager: mocks.jetstreamManager,
  };
});

vi.mock("@nats-io/kv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nats-io/kv")>();
  return {
    ...actual,
    Kvm: class {
      constructor(source: unknown) {
        return mocks.kvmConstructor(source);
      }
    },
  };
});

vi.mock("@nats-io/obj", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nats-io/obj")>();
  return {
    ...actual,
    Objm: class {
      constructor(source: unknown) {
        return mocks.objmConstructor(source);
      }
    },
  };
});

vi.mock("@nats-io/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nats-io/services")>();
  return {
    ...actual,
    Svcm: class {
      constructor(connection: unknown) {
        return mocks.svcmConstructor(connection);
      }
    },
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
    mocks.jetstream.mockReset();
    mocks.jetstreamManager.mockReset();
    mocks.kvmConstructor.mockReset();
    mocks.objmConstructor.mockReset();
    mocks.svcmConstructor.mockReset();
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

  it("maps local config names to official Node/Bun transport connection options", () => {
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

  it("creates a NATS connection with the official v3 Node/Bun transport", async () => {
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

  it("provides JSON and string codec helpers", () => {
    const jsonCodec = createNatsJsonCodec<{ ok: boolean }>();
    const stringCodec = createNatsStringCodec();

    expect(jsonCodec.decode(jsonCodec.encode({ ok: true }))).toEqual({
      ok: true,
    });
    expect(stringCodec.decode(stringCodec.encode("hello"))).toBe("hello");
  });

  it("publishes and requests typed JSON payloads", async () => {
    const codec = createNatsJsonCodec<{ ok: boolean }>();
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

    expect(
      createNatsJsonCodec<{ userId: string }>().decode(publishedPayload),
    ).toEqual({
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

  it("creates JetStream clients and managers with official v3 APIs", async () => {
    const connection = natsConnection();
    const jetStreamClient = { publish: vi.fn() } as unknown as JetStreamClient;
    const jetStreamManager = {
      getAccountInfo: vi.fn(),
    } as unknown as JetStreamManager;
    const options = { timeout: 1000 };
    mocks.jetstream.mockReturnValue(jetStreamClient);
    mocks.jetstreamManager.mockResolvedValue(jetStreamManager);

    expect(createNatsJetStream(connection, options)).toBe(jetStreamClient);
    await expect(createNatsJetStreamManager(connection, options)).resolves.toBe(
      jetStreamManager,
    );

    expect(mocks.jetstream).toHaveBeenCalledWith(connection, options);
    expect(mocks.jetstreamManager).toHaveBeenCalledWith(connection, options);
  });

  it("creates and opens KV helpers with the official v3 KV manager", async () => {
    const connection = natsConnection();
    const kv = { put: vi.fn() };
    const manager = {
      create: vi.fn(() => Promise.resolve(kv)),
      open: vi.fn(() => Promise.resolve(kv)),
    };
    mocks.kvmConstructor.mockReturnValue(manager);

    expect(createNatsKvManager(connection)).toBe(manager);
    await expect(
      createNatsKeyValueStore(connection, "settings", { history: 3 }),
    ).resolves.toBe(kv);
    await expect(openNatsKeyValueStore(connection, "settings")).resolves.toBe(
      kv,
    );

    expect(mocks.kvmConstructor).toHaveBeenCalledWith(connection);
    expect(manager.create).toHaveBeenCalledWith("settings", { history: 3 });
    expect(manager.open).toHaveBeenCalledWith("settings", undefined);
  });

  it("creates and opens Object Store helpers with the official v3 Obj manager", async () => {
    const connection = natsConnection();
    const store = { put: vi.fn() };
    const manager = {
      create: vi.fn(() => Promise.resolve(store)),
      open: vi.fn(() => Promise.resolve(store)),
    };
    mocks.objmConstructor.mockReturnValue(manager);

    expect(createNatsObjectStoreManager(connection)).toBe(manager);
    await expect(
      createNatsObjectStore(connection, "documents", { description: "docs" }),
    ).resolves.toBe(store);
    await expect(
      openNatsObjectStore(connection, "documents", false),
    ).resolves.toBe(store);

    expect(mocks.objmConstructor).toHaveBeenCalledWith(connection);
    expect(manager.create).toHaveBeenCalledWith("documents", {
      description: "docs",
    });
    expect(manager.open).toHaveBeenCalledWith("documents", false);
  });

  it("creates Services helpers with the official v3 Services manager", async () => {
    const connection = natsConnection();
    const service = { addEndpoint: vi.fn() };
    const manager = { add: vi.fn(() => Promise.resolve(service)) };
    const config = { name: "math", version: "1.0.0" };
    mocks.svcmConstructor.mockReturnValue(manager);

    expect(createNatsServiceManager(connection)).toBe(manager);
    await expect(addNatsService(connection, config)).resolves.toBe(service);

    expect(mocks.svcmConstructor).toHaveBeenCalledWith(connection);
    expect(manager.add).toHaveBeenCalledWith(config);
  });

  it("wires disabled module providers to null without creating a broker connection", async () => {
    const moduleRef = await createTestingNatsModule();

    expect(moduleRef.get(NatsInjectToken)).toBeNull();
    expect(moduleRef.get(NatsJetStreamInjectToken)).toBeNull();
    expect(moduleRef.get(NatsJetStreamManagerInjectToken)).toBeNull();
    expect(moduleRef.get(NatsKvManagerInjectToken)).toBeNull();
    expect(moduleRef.get(NatsObjectStoreManagerInjectToken)).toBeNull();
    expect(moduleRef.get(NatsServiceManagerInjectToken)).toBeNull();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.jetstream).not.toHaveBeenCalled();
    expect(mocks.jetstreamManager).not.toHaveBeenCalled();
    expect(mocks.kvmConstructor).not.toHaveBeenCalled();
    expect(mocks.objmConstructor).not.toHaveBeenCalled();
    expect(mocks.svcmConstructor).not.toHaveBeenCalled();

    await moduleRef.close();
  });

  it("wires connection, JetStream, KV, Obj, and Services module providers when enabled", async () => {
    const connection = natsConnection();
    const jetStreamClient = {} as JetStreamClient;
    const jetStreamManager = {} as JetStreamManager;
    const kvManager = {} as Kvm;
    const objectStoreManager = {} as Objm;
    const serviceManager = {} as Svcm;

    const moduleRef = await createTestingNatsModule({
      servers: ["nats://nats:4222"],
      client: connection,
      jetStreamFactory: vi.fn(() => jetStreamClient),
      jetStreamManagerFactory: vi.fn(() => Promise.resolve(jetStreamManager)),
      kvManagerFactory: vi.fn(() => kvManager),
      objectStoreManagerFactory: vi.fn(() => objectStoreManager),
      serviceManagerFactory: vi.fn(() => serviceManager),
    });

    expect(moduleRef.get(NatsInjectToken)).toBe(connection);
    expect(moduleRef.get(NatsJetStreamInjectToken)).toBe(jetStreamClient);
    await expect(
      moduleRef.resolve<JetStreamManager | null>(
        NatsJetStreamManagerInjectToken,
      ),
    ).resolves.toBe(jetStreamManager);
    expect(moduleRef.get(NatsKvManagerInjectToken)).toBe(kvManager);
    expect(moduleRef.get(NatsObjectStoreManagerInjectToken)).toBe(
      objectStoreManager,
    );
    expect(moduleRef.get(NatsServiceManagerInjectToken)).toBe(serviceManager);

    await moduleRef.close();
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

async function createTestingNatsModule(
  options: Parameters<typeof NatsModule.forRoot>[0] = {},
): Promise<TestingModule> {
  return await Test.createTestingModule({
    imports: [NatsModule.forRoot(options)],
  }).compile();
}

function natsConnection(
  overrides: Partial<NatsConnection> = {},
): NatsConnection {
  const connection = {
    closed: vi.fn(() => Promise.resolve(undefined)),
    close: vi.fn(() => Promise.resolve(undefined)),
    publish: vi.fn(),
    publishMessage: vi.fn(),
    respondMessage: vi.fn(),
    request: vi.fn(),
    requestMany: vi.fn(),
    subscribe: vi.fn(),
    flush: vi.fn(() => Promise.resolve(undefined)),
    drain: vi.fn(() => Promise.resolve(undefined)),
    isClosed: vi.fn(() => false),
    isDraining: vi.fn(() => false),
    getServer: vi.fn(() => "nats://nats:4222"),
    status: vi.fn(),
    stats: vi.fn(),
    rtt: vi.fn(),
    info: undefined,
    [Symbol.asyncDispose]: vi.fn(() => Promise.resolve(undefined)),
    ...overrides,
  };

  return connection as unknown as NatsConnection;
}
