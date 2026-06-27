import { describe, expect, it, vi } from "vitest";
import {
  createTelegramApplication,
  resolveTelegramApplication,
} from "./application";
import type { TelegramBotAuthPort, TelegramBotIdentity } from "./types";

const identity: TelegramBotIdentity = {
  provider: "telegram",
  channel: "telegram_bot",
  providerSubject: "42",
  username: "alice",
  displayName: "Alice",
  locale: "en",
  avatarUrl: null,
};

describe("Telegram application adapter", () => {
  it("adapts transport requests to the configured auth boundary", async () => {
    const consumeLinkPayload = vi.fn().mockResolvedValue({ kind: "link" });
    const createLinkInstructions = vi.fn().mockResolvedValue("open the app");
    const findLinkedUser = vi
      .fn()
      .mockResolvedValue({ userId: "user-1", tenantId: "tenant-1" });
    const updateLinkedUserLocale = vi.fn().mockResolvedValue(undefined);
    const auth: TelegramBotAuthPort = {
      consumeLinkPayload,
      createLinkInstructions,
      findLinkedUser,
      updateLinkedUserLocale,
    };
    const application = createTelegramApplication({ auth });

    await expect(
      application.consumeStartPayload("payload", identity),
    ).resolves.toEqual({
      kind: "link",
    });
    await expect(application.createLinkInstructions(identity)).resolves.toBe(
      "open the app",
    );
    await expect(application.findLinkedUser(identity)).resolves.toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
    });
    await application.updateLinkedUserLocale({ identity, locale: "ru" });

    expect(consumeLinkPayload).toHaveBeenCalledWith("payload", identity);
    expect(createLinkInstructions).toHaveBeenCalledWith(identity);
    expect(findLinkedUser).toHaveBeenCalledWith(identity);
    expect(updateLinkedUserLocale).toHaveBeenCalledWith({
      identity,
      locale: "ru",
    });
  });

  it("keeps handlers safe when an application integration is not installed", async () => {
    const application = createTelegramApplication();

    await expect(
      application.consumeStartPayload("payload", identity),
    ).resolves.toBeNull();
    await expect(
      application.createLinkInstructions(identity),
    ).resolves.toBeNull();
    await expect(application.findLinkedUser(identity)).resolves.toBeNull();
    await expect(
      application.updateLinkedUserLocale({ identity, locale: "en" }),
    ).resolves.toBeUndefined();
  });

  it("preserves an explicit application boundary", () => {
    const application = createTelegramApplication();

    expect(resolveTelegramApplication(application)).toBe(application);
  });
});
