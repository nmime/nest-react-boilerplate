import { describe, expect, it } from "vitest";
import {
  addTgUsernamesToMessage,
  normalizeTelegramUsernames,
} from "./add-tg-usernames-to-message.util";

describe("normalizeTelegramUsernames", () => {
  it("returns an empty list for empty, malformed, or too-short inputs", () => {
    expect(
      normalizeTelegramUsernames([
        "",
        "   ",
        "@",
        "@abcd",
        "1startsWithNumber",
        "invalid-user",
        "invalid.user",
        "tooLong".repeat(6),
      ]),
    ).toEqual([]);
  });

  it("normalizes optional @ prefixes and preserves valid username casing", () => {
    expect(normalizeTelegramUsernames(["supportTeam", "@Ops_Team1"])).toEqual([
      "@supportTeam",
      "@Ops_Team1",
    ]);
  });

  it("deduplicates usernames case-insensitively in first-seen order", () => {
    expect(
      normalizeTelegramUsernames([
        "SupportTeam",
        "@supportteam",
        "SUPPORTTEAM",
        "OpsTeam",
      ]),
    ).toEqual(["@SupportTeam", "@OpsTeam"]);
  });

  it("parses comma, whitespace, and newline separated username lists", () => {
    expect(
      normalizeTelegramUsernames([
        "@supportTeam,@Ops_Team1",
        "release_team\nalertsTeam",
        "devTeam qaTeam",
      ]),
    ).toEqual([
      "@supportTeam",
      "@Ops_Team1",
      "@release_team",
      "@alertsTeam",
      "@devTeam",
      "@qaTeam",
    ]);
  });
});

describe("addTgUsernamesToMessage", () => {
  it("returns the original message when no valid usernames remain", () => {
    expect(
      addTgUsernamesToMessage("Health check failed", ["", "bad-name"]),
    ).toBe("Health check failed");
  });

  it("appends deterministic usernames on a new line", () => {
    expect(
      addTgUsernamesToMessage("Health check failed", [
        "@supportTeam, opsTeam",
        "supportTeam",
      ]),
    ).toBe("Health check failed\n@supportTeam @opsTeam");
  });

  it("preserves an existing trailing message newline", () => {
    expect(addTgUsernamesToMessage("Health check failed\n", ["opsTeam"])).toBe(
      "Health check failed\n@opsTeam",
    );
  });
});
