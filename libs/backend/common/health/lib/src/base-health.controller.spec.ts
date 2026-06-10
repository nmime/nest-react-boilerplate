import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { BaseHealthController } from "./base-health.controller";
import { HealthService } from "./health.service";

describe("BaseHealthController", () => {
  it("exposes /health compatible raw health checks", async () => {
    const controller = new BaseHealthController(
      new HealthService({ appName: "api", indicators: [] }),
    );

    await expect(controller.getHealth()).resolves.toMatchObject({
      status: "ok",
      checks: [],
    });
  });

  it("exposes /live and /health/private envelope responses", async () => {
    const controller = new BaseHealthController(
      new HealthService({ appName: "api", indicators: [] }),
    );

    await expect(controller.getLiveness()).resolves.toMatchObject({
      data: { app: "api", status: "ok", dependencies: [], checks: [] },
    });
    await expect(controller.getPrivateHealth()).resolves.toMatchObject({
      data: { app: "api", status: "ok", dependencies: [], checks: [] },
    });
  });

  it("throws HTTP 503 semantics for readiness mandatory failures", async () => {
    const controller = new BaseHealthController(
      new HealthService({
        appName: "api",
        indicators: [
          {
            name: "postgres",
            check: () => ({ name: "postgres", status: "error" }),
          },
        ],
      }),
    );

    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("allows readiness success for skipped optional indicators", async () => {
    const controller = new BaseHealthController(
      new HealthService({
        appName: "api",
        indicators: [
          {
            name: "i18n",
            required: false,
            check: () => ({ name: "i18n", status: "skipped", required: false }),
          },
        ],
      }),
    );

    await expect(controller.getReadiness()).resolves.toMatchObject({
      data: {
        app: "api",
        status: "ok",
        checks: [{ name: "i18n", status: "skipped", required: false }],
      },
    });
  });
});
