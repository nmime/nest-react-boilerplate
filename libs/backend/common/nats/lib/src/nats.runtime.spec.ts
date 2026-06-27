import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { NatsConnection, QueuedIterator } from "@nats-io/nats-core";
import {
  NatsHealthIndicator,
  NatsInjectToken,
  NatsJetStreamService,
  NatsKvService,
  NatsModule,
  NatsObjectStoreService,
  NatsService,
  NatsServicesService,
  closeNatsConnection,
} from "./index";
import {
  hasDockerRuntime,
  startNatsContainer,
  stopNatsContainer,
  type StartedServiceContainer,
} from "@app/backend/common/component-test";

interface StartedNatsRuntimeContainer extends StartedServiceContainer {
  server: string;
}

const dockerAvailable = hasDockerRuntime();
const actualDockerRuntimeAvailable = hasActualDockerRuntime();
const runRuntimeSmoke = dockerAvailable && actualDockerRuntimeAvailable;
if (!runRuntimeSmoke) {
  process.stderr.write(
    [
      "NATS runtime smoke tests: skipped because an actual Docker runtime is not available on this host.",
      `hasDockerRuntime=${dockerAvailable}`,
      `actualDockerRuntimeAvailable=${actualDockerRuntimeAvailable}`,
      "startNatsContainer will not be called.",
      "\n",
    ].join(" "),
  );
}
const describeIfDocker = runRuntimeSmoke ? describe : describe.skip;

describeIfDocker("NATS runtime smoke", () => {
  let container: StartedNatsRuntimeContainer | undefined;
  let moduleRef: TestingModule;
  let connection: NatsConnection;

  beforeAll(async () => {
    const startedContainer = await startNatsContainer({ jetStream: true });
    container = startedContainer;
    moduleRef = await Test.createTestingModule({
      imports: [
        NatsModule.forRoot({
          servers: [startedContainer.server],
          name: "nats-runtime-smoke",
          reconnect: false,
          timeoutMs: 5_000,
          drainTimeoutMs: 5_000,
        }),
      ],
    }).compile();

    connection = moduleRef.get<NatsConnection>(NatsInjectToken);
  }, 60_000);

  afterAll(async () => {
    await moduleRef?.close();
    await stopNatsContainer(container);
  });

  it("connects through the NATS module, flushes health, and drains shutdown", async () => {
    expect(connection.isClosed()).toBe(false);
    expect(connection.getServer()).toContain(":");

    await expect(connection.flush()).resolves.toBeUndefined();
    await expect(
      moduleRef.get(NatsHealthIndicator).check(),
    ).resolves.toMatchObject({
      name: "nats",
      status: "ok",
      details: { enabled: true },
    });

    const shutdownConnection = await startNatsContainer().then(
      (plainContainer) =>
        Test.createTestingModule({
          imports: [
            NatsModule.forRoot({
              servers: [plainContainer.server],
              reconnect: false,
              timeoutMs: 5_000,
              drainTimeoutMs: 5_000,
            }),
          ],
        })
          .compile()
          .then((shutdownModule) => ({ plainContainer, shutdownModule })),
    );

    try {
      const nc =
        shutdownConnection.shutdownModule.get<NatsConnection>(NatsInjectToken);
      await closeNatsConnection(nc, { drainTimeoutMs: 5_000 });
      expect(nc.isClosed()).toBe(true);
    } finally {
      await shutdownConnection.shutdownModule.close();
      await stopNatsContainer(shutdownConnection.plainContainer);
    }
  });

  it("round-trips Core publish/request with NatsService", async () => {
    const nats = moduleRef.get(NatsService);
    expect(nats.isEnabled).toBe(true);

    const subscription = connection.subscribe("runtime.core.echo", {
      callback: (_error, msg) => {
        msg.respond(JSON.stringify({ echo: msg.string() }));
      },
    });

    try {
      await expect(
        nats.requestJson<{ echo: string }, { hello: string }>(
          "runtime.core.echo",
          { hello: "world" },
          { timeout: 5_000 },
        ),
      ).resolves.toEqual({ echo: JSON.stringify({ hello: "world" }) });

      nats.publishString("runtime.core.fire", "ok");
      await connection.flush();
    } finally {
      subscription.unsubscribe();
      await subscription.closed;
    }
  });

  it("creates JetStream manager/client and KV buckets against a JetStream server", async () => {
    const jetStream = moduleRef.get(NatsJetStreamService);
    const manager = await jetStream.getManager({ checkAPI: true });
    const client = jetStream.getClient();

    expect(manager).toBeDefined();
    expect(client).toBeDefined();
    const accountInfo = await manager.getAccountInfo();
    expect(typeof accountInfo.streams).toBe("number");

    const kvManager = moduleRef.get(NatsKvService).getManager();
    const bucketName = `runtime_kv_${Date.now()}`;
    const bucket = await kvManager.create(bucketName);

    try {
      await expect(bucket.put("profile.user-1", "Ada")).resolves.toEqual(
        expect.any(Number),
      );
      await expect(bucket.get("profile.user-1")).resolves.toMatchObject({
        key: "profile.user-1",
      });
      expect((await bucket.get("profile.user-1"))?.string()).toBe("Ada");
      await bucket.delete("profile.user-1");
      expect((await bucket.get("profile.user-1"))?.operation).toBe("DEL");
    } finally {
      await bucket.destroy();
    }
  });

  it("creates Object Store buckets and puts/gets/deletes objects", async () => {
    const objectManager = moduleRef.get(NatsObjectStoreService).getManager();
    const storeName = `runtime_obj_${Date.now()}`;
    const store = await objectManager.create(storeName);

    try {
      const payload = new TextEncoder().encode("hello object store");
      await expect(
        store.putBlob({ name: "readme.txt" }, payload),
      ).resolves.toMatchObject({ name: "readme.txt" });
      expect(Buffer.from(await store.getBlob("readme.txt"))).toEqual(
        Buffer.from(payload),
      );
      await expect(store.delete("readme.txt")).resolves.toMatchObject({
        success: true,
      });
      expect(await store.get("readme.txt")).toBeNull();
    } finally {
      await managerDeleteStream(moduleRef, `OBJ_${storeName}`);
    }
  });

  it("adds a NATS service endpoint and pings/requests it", async () => {
    const services = moduleRef.get(NatsServicesService).getManager();
    const service = await services.add({
      name: "runtime",
      version: "1.0.0",
      queue: "",
    });

    service.addEndpoint("echo", (_error, msg) => {
      msg.respond(JSON.stringify({ echo: msg.string() }));
    });

    try {
      const client = services.client({
        strategy: "count",
        maxMessages: 1,
        maxWait: 5_000,
      });
      const pings = await collectQueuedIterator(await client.ping("runtime"));
      expect(pings).toHaveLength(1);
      expect(pings[0]).toMatchObject({ name: "runtime", version: "1.0.0" });

      await expect(
        moduleRef
          .get(NatsService)
          .requestJson<
            { echo: string },
            { ping: boolean }
          >("echo", { ping: true }, { timeout: 5_000 }),
      ).resolves.toEqual({ echo: JSON.stringify({ ping: true }) });
    } finally {
      await service.stop();
    }
  });
});

async function collectQueuedIterator<T>(
  iterator: QueuedIterator<T> | undefined,
): Promise<T[]> {
  if (!iterator) {
    return [];
  }

  const values: T[] = [];
  for await (const value of iterator) {
    values.push(value);
  }

  return values;
}

async function managerDeleteStream(
  moduleRef: TestingModule | undefined,
  stream: string,
): Promise<void> {
  if (!moduleRef) {
    return;
  }
  const manager = await moduleRef.get(NatsJetStreamService).getManager();
  await manager.streams.delete(stream).catch(() => false);
}

/**
 * Runtime smoke tests need a real Docker daemon, not only the shared CI
 * convention used by hasDockerRuntime(). This spec-local guard prevents
 * Testcontainers startup in CI sandboxes where Docker is intentionally absent.
 */
function hasActualDockerRuntime(): boolean {
  if (process.env.SKIP_TESTCONTAINERS === "true") {
    return false;
  }

  const dockerBinaryPaths = [
    "docker",
    "/usr/bin/docker",
    "/usr/local/bin/docker",
    "/opt/homebrew/bin/docker",
  ] as const;

  return dockerBinaryPaths.some((dockerBinaryPath) => {
    try {
      const result = spawnSync(dockerBinaryPath, ["info"], {
        stdio: "ignore",
        timeout: 5_000,
      });
      return result.status === 0;
    } catch {
      return false;
    }
  });
}
