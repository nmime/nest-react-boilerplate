import { InteractionType } from "discord-api-types/v10";
import { describe, expect, it } from "vitest";
import { DiscordAccountService } from "./discord-account.service";
import { DiscordCustomIdCodec } from "./discord-custom-id.codec";
import { DiscordInteractionRouter } from "./discord-interaction-router";
import { DiscordNavigationStateService } from "./discord-navigation-state.service";

const secret = "router-test-secret";
const user = {
  id: "123456789012345678",
  username: "tester",
  discriminator: "0",
  avatar: null,
};

function router(
  account = new DiscordAccountService(undefined, {
    build: () => ({ authorizationUrl: "https://example.test/auth/discord" }),
  }),
) {
  return new DiscordInteractionRouter(
    account,
    new DiscordCustomIdCodec(),
    new DiscordNavigationStateService(),
  );
}

describe("DiscordInteractionRouter", () => {
  it("responds to PING with Pong", async () => {
    await expect(
      router().route(
        {
          type: InteractionType.Ping,
          id: "1",
          application_id: "2",
          version: 1,
        } as never,
        { customIdSecret: secret },
      ),
    ).resolves.toEqual({ type: 1 });
  });

  it("routes /account link to ephemeral link instructions", async () => {
    const response = await router().route(
      {
        type: InteractionType.ApplicationCommand,
        id: "1",
        application_id: "2",
        version: 1,
        token: "token",
        locale: "ru",
        guild_locale: "en-US",
        guild_id: "234567890123456789",
        user,
        data: {
          id: "3",
          name: "account",
          type: 1,
          options: [{ name: "link", type: 1 }],
        },
      } as never,
      {
        customIdSecret: secret,
        tenantId: "00000000-0000-0000-0000-000000000000",
      },
    );

    expect(response.type).toBe(4);
    expect(JSON.stringify(response)).toContain("Используйте кнопку");
    expect(JSON.stringify(response)).toContain(
      "https://example.test/auth/discord",
    );
  });

  it("returns localized expired error for mismatched component owner", async () => {
    const codec = new DiscordCustomIdCodec();
    const customId = codec.encode(
      {
        action: "home",
        userId: "999999999999999999",
        guildId: "234567890123456789",
        tenantId: "00000000-0000-0000-0000-000000000000",
      },
      { secret },
    );
    const response = await router().route(
      {
        type: InteractionType.MessageComponent,
        id: "1",
        application_id: "2",
        version: 1,
        token: "token",
        locale: "en-US",
        guild_locale: "en-US",
        guild_id: "234567890123456789",
        user,
        data: { component_type: 2, custom_id: customId },
      } as never,
      {
        customIdSecret: secret,
        tenantId: "00000000-0000-0000-0000-000000000000",
      },
    );

    expect(JSON.stringify(response)).toContain(
      "This bot action expired. Please start again.",
    );
  });
});
