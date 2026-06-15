import { describe, expect, it } from "vitest";
import { DiscordCommandRegistrationService } from "./discord-command-registration.service";
import { DiscordBotConfig } from "./discord-config";
import { buildDiscordCommands } from "./discord-ui";

describe("Discord command registration", () => {
  it("builds localized account/help slash command JSON without Discord credentials", () => {
    const service = new DiscordCommandRegistrationService(
      new DiscordBotConfig(),
    );
    const snapshot = service.dryRun({
      DISCORD_APPLICATION_ID: "123456789012345678",
      DISCORD_PUBLIC_KEY: "a".repeat(64),
      DISCORD_CUSTOM_ID_SECRET: "secret",
      DISCORD_REGISTRATION_GUILD_ID: "234567890123456789",
    });

    expect(snapshot).toMatchObject({
      scope: "guild",
      applicationId: "123456789012345678",
      guildId: "234567890123456789",
    });
    expect(snapshot.commands.map((command) => command.name)).toEqual([
      "account",
      "help",
    ]);
    expect(snapshot.commands[0]?.name_localizations).toEqual({});
    expect(snapshot.commands[0]?.options?.map((option) => option.name)).toEqual(
      ["link", "status"],
    );
    expect(
      snapshot.commands[0]?.options?.[0]?.description_localizations,
    ).toEqual({
      ru: "Привязать Discord к учетной записи на сайте.",
    });
  });

  it("keeps command names lowercase and descriptions within Discord limits", () => {
    for (const { json } of buildDiscordCommands()) {
      expect(json.name).toBe(json.name.toLowerCase());
      expect(json.name.length).toBeGreaterThan(0);
      expect(json.name.length).toBeLessThanOrEqual(32);
      expect(json.description.length).toBeLessThanOrEqual(100);
      for (const option of json.options ?? []) {
        expect(option.name).toBe(option.name.toLowerCase());
        expect(option.description.length).toBeLessThanOrEqual(100);
      }
    }
  });
});
