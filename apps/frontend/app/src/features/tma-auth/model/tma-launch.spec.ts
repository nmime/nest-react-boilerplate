import { describe, expect, it } from "vitest";
import { mapTmaStartParamToRoute } from "./tma-launch";

describe("mapTmaStartParamToRoute", () => {
  it("maps supported Telegram start payloads to app routes", () => {
    expect(mapTmaStartParamToRoute("profile")).toBe("/profile");
    expect(mapTmaStartParamToRoute("settings")).toBe("/settings");
    expect(mapTmaStartParamToRoute("link_telegram")).toBe("/link/telegram");
    expect(mapTmaStartParamToRoute("unknown")).toBeNull();
  });
});
