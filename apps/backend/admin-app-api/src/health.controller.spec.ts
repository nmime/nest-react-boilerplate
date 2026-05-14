import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

describe("backend-admin-app-api HealthController", () => {
  it("returns a stable health response", () => {
    expect(new HealthController().health()).toEqual({
      data: { app: "backend-admin-app-api", status: "ok" },
    });
  });
});
