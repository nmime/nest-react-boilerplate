import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

describe("user-app-api HealthController", () => {
  it("returns a stable health response", () => {
    expect(new HealthController().health()).toEqual({
      data: { app: "user-app-api", status: "ok" },
    });
  });
});
