import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

describe("auth-app-api HealthController", () => {
  it("returns a stable health response", () => {
    expect(new HealthController().health()).toEqual({
      data: { app: "auth-app-api", status: "ok" },
    });
  });
});
