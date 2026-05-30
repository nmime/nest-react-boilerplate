import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";

describe("user-app-api HealthController", () => {
  it("returns stable liveness responses", () => {
    const controller = new HealthController();

    expect(controller.health()).toEqual({
      data: { app: "user-app-api", status: "ok" },
    });
    expect(controller.live()).toEqual({
      data: { app: "user-app-api", status: "ok" },
    });
  });

  it("returns readiness without dependencies when no database is registered", async () => {
    await expect(new HealthController().ready()).resolves.toEqual({
      data: { app: "user-app-api", status: "ok" },
    });
  });

  it("checks the database when MikroORM is available", async () => {
    const execute = vi.fn(() => Promise.resolve([{ ok: 1 }]));
    const controller = new HealthController({
      em: { getConnection: () => ({ execute }) },
    } as never);

    await expect(controller.ready()).resolves.toEqual({
      data: {
        app: "user-app-api",
        status: "ok",
        dependencies: [{ name: "postgres", status: "ok" }],
      },
    });
    expect(execute).toHaveBeenCalledWith("select 1");
  });

  it("fails readiness when the database check fails", async () => {
    const controller = new HealthController({
      em: {
        getConnection: () => ({
          execute: () => Promise.reject(new Error("database unavailable")),
        }),
      },
    } as never);

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("uses a safe readiness detail for non-Error database failures", async () => {
    const nonErrorDatabaseFailure = { message: "offline" } as Error;
    const controller = new HealthController({
      em: {
        getConnection: () => ({
          execute: () => Promise.reject(nonErrorDatabaseFailure),
        }),
      },
    } as never);

    try {
      await controller.ready();
      throw new Error("Expected readiness to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(
        (error as ServiceUnavailableException).getResponse(),
      ).toMatchObject({
        app: "user-app-api",
        status: "degraded",
        dependencies: [
          {
            name: "postgres",
            status: "unavailable",
            detail: "PostgreSQL readiness check failed.",
          },
        ],
      });
    }
  });
});
