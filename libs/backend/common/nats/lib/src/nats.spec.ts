import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Msg } from "@nats-io/nats-core";
import type { NatsConnection } from "@nats-io/nats-core";
import { NatsConfigService } from "./config";
import {
  closeNatsConnection,
  createNatsConnection,
  toNatsConnectionOptions,
} from "./nats-client.factory";
import {
  createJetStream,
  createJetStreamManager,
} from "./nats-jetstream.factory";
import { NatsJetStreamService } from "./nats-jetstream.service";
import { createKvm } from "./nats-kv.factory";
import { NatsKvService } from "./nats-kv.service";
import { createObjm } from "./nats-object-store.factory";
import { NatsObjectStoreService } from "./nats-object-store.service";
import { createServices } from "./nats-services.factory";
import { NatsServicesService } from "./nats-services.service";
import { NatsHealthIndicator } from "./nats.health";
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

vi.mock("@nats-io/jetstream", () => ({
  jetstream: mocks.jetstream,
  jetstreamManager: mocks.jetstreamManager,
}));

vi.mock("@nats-io/kv", () => ({
  Kvm: class Kvm {
    create = vi.fn();
    open = vi.fn();

    constructor(source: unknown) {
      mocks.kvmConstructor(source);
    }
  },
}));

vi.mock("@nats-io/obj", () => ({
  Objm: class Objm {
    create = vi.fn();
    open = vi.fn();
    list = vi.fn();

    constructor(source: unknown) {
      mocks.objmConstructor(source);
    }
  },
}));

vi.mock("@nats-io/services", () => ({
  Svcm: class Svcm {
    add = vi.fn();
    client = vi.fn();

    constructor(connection: unknown) {
      mocks.svcmConstructor(connection);
    }
  },
}));

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
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }

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

  it("rejects NATS integer environment values with trailing junk", () => {
    process.env.NATS_SERVERS = "nats://nats:4222";
    process.env.NATS_TIMEOUT_MS = "1500ms";

    expect(() => new NatsConfigService().connectionConfig).toThrow(
      /Invalid environment configuration.*NATS_TIMEOUT_MS/u,
    );
  });

  it("accepts explicit negative reconnect attempts without trailing junk", () => {
    process.env.NATS_SERVERS = "nats://nats:4222";
    process.env.NATS_MAX_RECONNECT_ATTEMPTS = "-1";

    expect(new NatsConfigService().connectionConfig).toMatchObject({
      maxReconnectAttempts: -1,
    });
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

  it("maps local config names to official v3 Node/Bun transport options", () => {
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

  it("creates a NATS connection with official @nats-io/transport-node", async () => {
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

  it("publishes and requests JSON with v3 string payload and msg.json behavior", async () => {
    const responsePayload = { ok: true };
    const response = msg({
      jsonValue: responsePayload,
      stringValue: "response",
    });
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
    ).resolves.toEqual(responsePayload);

    expect(publish).toHaveBeenCalledWith(
      "events.user.created",
      JSON.stringify({ userId: "user-1" }),
      undefined,
    );
    expect(request).toHaveBeenCalledWith(
      "rpc.user.lookup",
      JSON.stringify({ userId: "user-1" }),
      { timeout: 250 },
    );
    expect(response.json()).toEqual(responsePayload);
  });

  it("publishes and requests strings directly", async () => {
    const response = msg({ stringValue: "pong" });
    const request = vi.fn(() => Promise.resolve(response));
    const publish = vi.fn();
    const service = new NatsService(natsConnection({ publish, request }));

    service.publishString("events.text", "hello");
    await expect(
      service.requestString("rpc.text", "ping", { timeout: 100 }),
    ).resolves.toBe("pong");

    expect(publish).toHaveBeenCalledWith("events.text", "hello", undefined);
    expect(request).toHaveBeenCalledWith("rpc.text", "ping", {
      timeout: 100,
    });
    expect(response.string()).toBe("pong");
  });

  it("does not allow publishing when NATS is not configured", () => {
    const service = new NatsService(null);

    expect(() => service.publishJson("events", {})).toThrow(
      NatsConnectionUnavailableError,
    );
  });

  it("does not allow using a closed or draining connection", () => {
    expect(() =>
      new NatsService(
        natsConnection({ isClosed: vi.fn(() => true) }),
      ).getConnection(),
    ).toThrow("closed");
    expect(() =>
      new NatsService(
        natsConnection({ isDraining: vi.fn(() => true) }),
      ).getConnection(),
    ).toThrow("draining");
  });

  it("creates JetStream, manager, KV, object store, and services factories", async () => {
    const connection = natsConnection();
    const js = { kind: "jetstream" };
    const jsm = { kind: "jetstreamManager" };
    mocks.jetstream.mockReturnValue(js);
    mocks.jetstreamManager.mockResolvedValue(jsm);

    expect(createJetStream(connection, { domain: "hub" })).toBe(js);
    await expect(
      createJetStreamManager(connection, { domain: "hub", checkAPI: false }),
    ).resolves.toBe(jsm);
    const kvm = createKvm(js as never);
    const objm = createObjm(js as never);
    const services = createServices(connection);

    expect(mocks.jetstream).toHaveBeenCalledWith(connection, { domain: "hub" });
    expect(mocks.jetstreamManager).toHaveBeenCalledWith(connection, {
      domain: "hub",
      checkAPI: false,
    });
    expect(mocks.kvmConstructor).toHaveBeenCalledWith(js);
    expect(mocks.objmConstructor).toHaveBeenCalledWith(js);
    expect(mocks.svcmConstructor).toHaveBeenCalledWith(connection);
    expect(kvm).toBeDefined();
    expect(objm).toBeDefined();
    expect(services).toBeDefined();
  });

  it("exposes ready-to-use JetStream, KV, Obj, and Services providers", async () => {
    const connection = natsConnection();
    const core = new NatsService(connection);
    const jsClient = { publish: vi.fn(() => Promise.resolve({ seq: 1 })) };
    const jsManager = { streams: {} };
    mocks.jetstream.mockReturnValue(jsClient);
    mocks.jetstreamManager.mockResolvedValue(jsManager);

    const jsService = new NatsJetStreamService(core);
    expect(jsService.getClient({ domain: "hub" })).toBe(jsClient);
    await expect(jsService.getManager({ checkAPI: false })).resolves.toBe(
      jsManager,
    );
    await expect(
      jsService.publishJson("events", { ok: true }),
    ).resolves.toEqual({
      seq: 1,
    });
    expect(jsClient.publish).toHaveBeenCalledWith(
      "events",
      JSON.stringify({ ok: true }),
      undefined,
    );

    expect(new NatsKvService(core).getManager()).toBeDefined();
    expect(mocks.kvmConstructor).toHaveBeenLastCalledWith(connection);
    expect(new NatsObjectStoreService(core).getManager()).toBeDefined();
    expect(mocks.objmConstructor).toHaveBeenLastCalledWith(connection);
    expect(new NatsServicesService(core).getManager()).toBeDefined();
    expect(mocks.svcmConstructor).toHaveBeenLastCalledWith(connection);
  });

  it("keeps extended providers disabled until a NATS connection is configured", () => {
    const core = new NatsService(null);

    expect(() => new NatsJetStreamService(core).getClient()).toThrow(
      NatsConnectionUnavailableError,
    );
    expect(() => new NatsKvService(core).getManager()).toThrow(
      NatsConnectionUnavailableError,
    );
    expect(() => new NatsObjectStoreService(core).getManager()).toThrow(
      NatsConnectionUnavailableError,
    );
    expect(() => new NatsServicesService(core).getManager()).toThrow(
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

  it("closes connections if draining times out", async () => {
    const drain = vi.fn(() => new Promise<void>(() => undefined));
    const close = vi.fn(() => Promise.resolve(undefined));
    const connection = natsConnection({ drain, close });

    await closeNatsConnection(connection, { drainTimeoutMs: 1 });

    expect(drain).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("guards source against removed v2 APIs and legacy messaging runtimes", () => {
    const root = join(__dirname, "../../../../../..");
    const files = collectSourceFiles(root);
    const sourceByFile = new Map(
      files.map((file) => [file, readFileSync(join(root, file), "utf8")]),
    );
    const source = [...sourceByFile.entries()]
      .filter(
        ([file]) => file !== "libs/backend/common/nats/lib/src/nats.spec.ts",
      )
      .map(([, content]) => content)
      .join("\n");
    const removedCodecA = ["String", "Codec"].join("");
    const removedCodecB = ["JSON", "Codec"].join("");
    const removedMethodA = [".", "jetstream", "("].join("");
    const removedMethodB = [".", "jetstreamManager", "("].join("");
    const legacyImport = ["from ", JSON.stringify("nats")].join("");

    for (const forbidden of [
      legacyImport,
      removedCodecA,
      removedCodecB,
      removedMethodA,
      removedMethodB,
      ["rabbitmq", "-container"].join(""),
      ["create", "Rabbit", "Mq"].join(""),
      ["Default", "Rabbit", "Mq"].join(""),
      ["RABBIT", "MQ_"].join(""),
      ["@nestjs", "/microservices"].join(""),
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

function msg({
  jsonValue = {},
  stringValue = "",
}: {
  jsonValue?: unknown;
  stringValue?: string;
}): Msg {
  return {
    data: new Uint8Array(),
    json: vi.fn(() => jsonValue),
    string: vi.fn(() => stringValue),
  } as unknown as Msg;
}

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

function collectSourceFiles(root: string): string[] {
  const allowedRoots = ["libs", "apps", "packages", "scripts", "docs"];
  const allowedExtensions = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".cjs",
    ".json",
    ".md",
  ]);
  const ignoredDirectories = new Set([
    "node_modules",
    "dist",
    ".nx",
    ".git",
    "coverage",
  ]);
  const files: string[] = [];

  const visit = (relativeDirectory: string): void => {
    for (const entry of readdirSync(join(root, relativeDirectory))) {
      if (ignoredDirectories.has(entry)) {
        continue;
      }

      const relativePath = join(relativeDirectory, entry);
      const absolutePath = join(root, relativePath);
      const stat = statSync(absolutePath);
      if (stat.isDirectory()) {
        visit(relativePath);
        continue;
      }

      const extension = entry.includes(".")
        ? `.${entry.split(".").pop() ?? ""}`
        : "";
      if (stat.isFile() && allowedExtensions.has(extension)) {
        files.push(relativePath);
      }
    }
  };

  for (const directory of allowedRoots) {
    visit(directory);
  }

  return files;
}
