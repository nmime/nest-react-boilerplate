import { describe, expect, it } from "vitest";
import {
  DefaultNatsClientPort,
  DefaultNatsMonitoringPort,
  DefaultNatsTestImage,
  createNatsContainer,
} from "./nats-container";

describe("nats test container helpers", () => {
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
});
