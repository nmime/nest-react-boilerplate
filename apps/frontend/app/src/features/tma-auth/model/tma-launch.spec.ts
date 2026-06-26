import { describe, expect, it } from "vitest";
import { mapTmaStartParamToRoute, parseTmaLaunchState } from "./tma-launch";

describe("mapTmaStartParamToRoute", () => {
  it("maps supported Telegram start payloads to app routes", () => {
    expect(mapTmaStartParamToRoute("profile")).toBe("/profile");
    expect(mapTmaStartParamToRoute("settings")).toBe("/settings");
    expect(mapTmaStartParamToRoute("link_telegram")).toBe("/settings");
    expect(mapTmaStartParamToRoute("link_discord")).toBe("/link/discord");
    expect(mapTmaStartParamToRoute("unknown")).toBeNull();
  });
});

describe("parseTmaLaunchState", () => {
  it.each(["link_telegram", "link_discord", "link"])(
    "parses %s as a link intent",
    (startParam) => {
      expect(
        parseTmaLaunchState({
          initData: "query_id=raw&hash=hash",
          isTelegram: true,
          startParam,
        }),
      ).toMatchObject({ intent: "link" });
    },
  );

  it("keeps login intent for normal launch targets", () => {
    expect(
      parseTmaLaunchState({ isTelegram: true, startParam: "profile" }),
    ).toMatchObject({
      deepNavigationState: "loading",
      intent: "login",
      returnUrl: "/profile",
    });
  });

  it("marks unsupported start parameters as not found", () => {
    expect(
      parseTmaLaunchState({ isTelegram: true, startParam: "missing" }),
    ).toMatchObject({
      deepNavigationState: "not-found",
      intent: "login",
      mappedRoute: null,
    });
  });
});
