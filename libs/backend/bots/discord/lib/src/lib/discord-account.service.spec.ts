import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscordAccountService } from "./discord-account.service";

const tenantId = "00000000-0000-0000-0000-000000000000";

describe("DiscordAccountService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("creates auth link URLs through the injected builder without OAuth credentials", async () => {
    const build = vi.fn().mockResolvedValue({
      authorizationUrl: "https://auth.example.test/discord/link?state=opaque",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    const service = new DiscordAccountService(undefined, { build });

    await expect(
      service.createLink({
        userId: "123456789012345678",
        guildId: "234567890123456789",
        tenantId,
        locale: "en",
        returnUrl: "https://app.example.test/return",
      }),
    ).resolves.toEqual({
      authorizationUrl: "https://auth.example.test/discord/link?state=opaque",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    expect(build).toHaveBeenCalledWith({
      userId: "123456789012345678",
      guildId: "234567890123456789",
      tenantId,
      locale: "en",
      returnUrl: "https://app.example.test/return",
    });
    expect(JSON.stringify(build.mock.calls)).not.toMatch(
      /access[_-]?token|refresh[_-]?token|client[_-]?secret/iu,
    );
  });

  it("creates auth link URLs from the safe environment template", async () => {
    vi.stubEnv(
      "DISCORD_AUTH_LINK_URL_TEMPLATE",
      "https://auth.example.test/link?user={discordUserId}&guild={guildId}&tenant={tenantId}&locale={locale}",
    );
    const service = new DiscordAccountService();

    await expect(
      service.createLink({
        userId: "user with spaces",
        guildId: "guild/id",
        tenantId: "tenant/id",
        locale: "ru",
      }),
    ).resolves.toEqual({
      authorizationUrl:
        "https://auth.example.test/link?user=user%20with%20spaces&guild=guild%2Fid&tenant=tenant%2Fid&locale=ru",
    });
  });

  it("surfaces auth-service unavailability and reports status", async () => {
    const service = new DiscordAccountService({
      createDiscordAuthorizationRequest: vi.fn(() => {
        throw new Error("auth service unavailable");
      }),
      listProviderIdentities: vi.fn().mockResolvedValue([
        {
          provider: "discord",
          providerSubject: "123456789012345678",
          displayName: null,
          username: "tester",
        },
        {
          provider: "github",
          providerSubject: "123456789012345678",
          displayName: "Wrong",
          username: "wrong",
        },
      ]),
    });

    await expect(
      service.createLink({
        userId: "123456789012345678",
        tenantId,
        locale: "en",
      }),
    ).rejects.toThrow("auth service unavailable");
    await expect(
      service.status({ userId: "123456789012345678", tenantId }),
    ).resolves.toEqual({ linked: true, displayName: "tester" });
    await expect(
      service.status({ userId: "999999999999999999", tenantId }),
    ).resolves.toEqual({ linked: false, displayName: null });
  });

  it("defaults to unlinked and requires a configured link builder", async () => {
    const service = new DiscordAccountService();

    await expect(
      service.status({ userId: "123456789012345678", tenantId }),
    ).resolves.toEqual({ linked: false });
    await expect(
      service.createLink({
        userId: "123456789012345678",
        tenantId,
        locale: "en",
      }),
    ).rejects.toThrow("Discord account link URL builder is not configured");
  });
});
