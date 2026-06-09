import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DefaultNatsClientPort,
  DefaultNatsMonitoringPort,
  DefaultNatsTestImage,
  createNatsContainer,
  stopNatsContainer,
} from "./nats-container";
import { hasDockerRuntime } from "./postgres-container";

describe("nats test container helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes default NATS test container constants", () => {
    expect(DefaultNatsTestImage).toBe("nats:2.10-alpine");
    expect(DefaultNatsClientPort).toBe(4222);
    expect(DefaultNatsMonitoringPort).toBe(8222);
  });

  it("creates a default NATS container without starting it", () => {
    expect(createNatsContainer()).toBeDefined();
  });

  it("creates a configured NATS container without starting it", () => {
    const container = createNatsContainer({
      image: "nats:2.10-alpine",
      startupTimeoutMs: 30_000,
    });

    expect(container).toBeDefined();
  });

  it("creates an optional JetStream-enabled NATS container without changing defaults", () => {
    const container = createNatsContainer({ jetStream: true });

    expect(container).toBeDefined();
  });

  it("demonstrates guarded Docker skip behavior for downstream NATS tests", () => {
    vi.stubEnv("SKIP_TESTCONTAINERS", "true");

    expect(hasDockerRuntime()).toBe(false);
  });

  it("stops started NATS containers when provided and ignores undefined", async () => {
    const stop = vi.fn(() => Promise.resolve());

    await stopNatsContainer({ container: { stop } } as never);
    await stopNatsContainer(undefined);

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
