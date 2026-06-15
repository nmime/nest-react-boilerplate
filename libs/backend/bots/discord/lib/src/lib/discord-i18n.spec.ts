import { InteractionType } from "discord-api-types/v10";
import { describe, expect, it, vi } from "vitest";
import {
  localizationsFor,
  resolveDiscordLocale,
  resolveInteractionLocale,
  t,
} from "./discord-i18n";

describe("Discord i18n helpers", () => {
  it("resolves locale order and fallback", () => {
    expect(resolveDiscordLocale("fr", "ru")).toBe("ru");
    expect(resolveDiscordLocale("en-US", "ru")).toBe("en");
    expect(resolveDiscordLocale(undefined, null, "unsupported")).toBe("en");
  });

  it("prefers linked Discord profile locale before interaction and guild locales", async () => {
    const listProviderIdentities = vi.fn().mockResolvedValue([
      {
        provider: "discord",
        providerSubject: "123456789012345678",
        profileMetadata: { locale: "ru" },
      },
    ]);

    await expect(
      resolveInteractionLocale(
        interaction({ locale: "en-US", guild_locale: "en-US" }),
        { listProviderIdentities },
        "tenant",
      ),
    ).resolves.toBe("ru");
    expect(listProviderIdentities).toHaveBeenCalledWith(
      "123456789012345678",
      "tenant",
    );
  });

  it("falls back to Discord locale, guild locale, then default", async () => {
    const unavailable = {
      listProviderIdentities: vi.fn().mockRejectedValue(new Error("down")),
    };

    await expect(
      resolveInteractionLocale(
        interaction({ locale: "ru", guild_locale: "en-US" }),
        unavailable,
        "tenant",
      ),
    ).resolves.toBe("ru");
    await expect(
      resolveInteractionLocale(
        interaction({ locale: "fr", guild_locale: "ru" }),
      ),
    ).resolves.toBe("ru");
    await expect(
      resolveInteractionLocale(
        interaction({ locale: "fr", guild_locale: "unsupported" }),
      ),
    ).resolves.toBe("en");
  });

  it("returns localized errors and command localization maps", () => {
    expect(t("bot.error.expired", "ru")).toBe(
      "Действие бота истекло. Начните заново.",
    );
    expect(localizationsFor("discord.commands.help.label")).toEqual({
      ru: "help",
    });
  });
});

function interaction(overrides: { locale?: string; guild_locale?: string }) {
  return {
    type: InteractionType.ApplicationCommand,
    id: "1",
    application_id: "2",
    version: 1,
    user: { id: "123456789012345678" },
    data: { id: "3", name: "help", type: 1 },
    ...overrides,
  } as never;
}
