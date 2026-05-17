import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";

describe("auth-app-api HealthController", () => {
  it("returns stable liveness responses", () => {
    const controller = new HealthController();

    expect(controller.health()).toEqual({
      data: { app: "auth-app-api", status: "ok" },
    });
    expect(controller.live()).toEqual({
      data: { app: "auth-app-api", status: "ok" },
    });
  });

  it("returns readiness without dependencies when no database is registered", async () => {
    await expect(new HealthController().ready()).resolves.toEqual({
      data: { app: "auth-app-api", status: "ok" },
    });
  });

  it("checks the database when MikroORM is available", async () => {
    const execute = vi.fn(() => Promise.resolve([{ ok: 1 }]));
    const controller = new HealthController({
      em: { getConnection: () => ({ execute }) },
    } as never);

    await expect(controller.ready()).resolves.toEqual({
      data: {
        app: "auth-app-api",
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
});
