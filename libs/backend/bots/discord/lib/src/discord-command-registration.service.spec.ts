import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscordCommandRegistrationService } from "./discord-command-registration.service";
import { DiscordBotConfig } from "./discord-config";
import { buildDiscordCommands } from "./discord-ui";

const baseEnv = {
  DISCORD_APPLICATION_ID: "123456789012345678",
  DISCORD_PUBLIC_KEY: "a".repeat(64),
  DISCORD_CUSTOM_ID_SECRET: "test-key",
};

describe("Discord command registration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds localized account/help slash command JSON without Discord credentials", () => {
    const service = new DiscordCommandRegistrationService(
      new DiscordBotConfig(),
    );
    const snapshot = service.dryRun({
      ...baseEnv,
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
    expect(snapshot.commands[0]?.options?.map((option) => option.name)).toEqual(
      ["link", "status"],
    );
    expect(
      snapshot.commands[0]?.options?.[0]?.description_localizations,
    ).toEqual({ ru: "Привязать Discord к учетной записи на сайте." });
  });

  it("keeps command names lowercase and descriptions within Discord limits", () => {
    for (const { json } of buildDiscordCommands()) {
      expect(json.name).toBe(json.name.toLowerCase());
      expect(json.name.length).toBeGreaterThan(0);
      expect(json.name.length).toBeLessThanOrEqual(32);
      expect(json.description.length).toBeLessThanOrEqual(100);
      for (const [locale, value] of Object.entries(
        json.name_localizations ?? {},
      )) {
        expect(value, `${json.name} ${locale}`).toBe(value?.toLowerCase());
        expect(value?.length).toBeLessThanOrEqual(32);
      }
      for (const option of json.options ?? []) {
        expect(option.name).toBe(option.name.toLowerCase());
        expect(option.description.length).toBeLessThanOrEqual(100);
        for (const [locale, value] of Object.entries(
          option.name_localizations ?? {},
        )) {
          expect(value, `${option.name} ${locale}`).toBe(value?.toLowerCase());
          expect(value?.length).toBeLessThanOrEqual(32);
        }
      }
    }
  });

  it("registers guild commands with native fetch URL/body and no real network", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const service = new DiscordCommandRegistrationService(
      new DiscordBotConfig(),
    );

    const snapshot = await service.register({
      ...baseEnv,
      DISCORD_BOT_TOKEN: ["opaque", "registration", "credential"].join("-"),
      DISCORD_COMMAND_REGISTRATION_SCOPE: "guild",
      DISCORD_REGISTRATION_GUILD_ID: "234567890123456789",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://discord.com/api/v10/applications/123456789012345678/guilds/234567890123456789/commands",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PUT" });
    expect((fetchMock.mock.calls[0]?.[1] as { body?: string })?.body).toBe(
      JSON.stringify(snapshot.commands),
    );
  });

  it("registers global commands and reports Discord failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);
    const service = new DiscordCommandRegistrationService(
      new DiscordBotConfig(),
    );

    await expect(
      service.register({
        ...baseEnv,
        DISCORD_BOT_TOKEN: ["opaque", "registration", "credential"].join("-"),
      }),
    ).rejects.toThrow("Discord command registration failed with status 503");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://discord.com/api/v10/applications/123456789012345678/commands",
    );
  });

  it("handles missing registration credentials without native fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new DiscordCommandRegistrationService(
      new DiscordBotConfig(),
    );

    await expect(service.register(baseEnv)).rejects.toThrow(
      "DISCORD_BOT_TOKEN is required for Discord command registration.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
