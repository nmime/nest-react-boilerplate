import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import { describe, expect, it, vi } from "vitest";
import { DiscordAccountService } from "./discord-account.service";
import {
  DiscordCustomIdCodec,
  type DiscordCustomIdAction,
} from "./discord-custom-id.codec";
import { DiscordInteractionRouter } from "./discord-interaction-router";
import { DiscordNavigationStateService } from "./discord-navigation-state.service";

const secret = "router-test-secret";
const tenantId = "00000000-0000-0000-0000-000000000000";
const guildId = "234567890123456789";
const user = {
  id: "123456789012345678",
  username: "tester",
  discriminator: "0",
  avatar: null,
};

function harness(
  account = new DiscordAccountService(undefined, {
    build: () => ({ authorizationUrl: "https://example.test/auth/discord" }),
  }),
) {
  const customIds = new DiscordCustomIdCodec();
  const navigation = new DiscordNavigationStateService();
  return {
    customIds,
    navigation,
    router: new DiscordInteractionRouter(account, customIds, navigation),
  };
}

function command(
  name: string,
  subcommand?: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    type: InteractionType.ApplicationCommand,
    id: "1",
    application_id: "2",
    version: 1,
    token: "interaction-callback",
    locale: "en-US",
    guild_locale: "ru",
    guild_id: guildId,
    user,
    data: {
      id: "3",
      name,
      type: 1,
      options: subcommand ? [{ name: subcommand, type: 1 }] : undefined,
    },
    ...overrides,
  } as never;
}

function component(customId: string, overrides: Record<string, unknown> = {}) {
  return {
    type: InteractionType.MessageComponent,
    id: "1",
    application_id: "2",
    version: 1,
    token: "interaction-callback",
    locale: "en-US",
    guild_locale: "ru",
    guild_id: guildId,
    user,
    data: { component_type: ComponentType.Button, custom_id: customId },
    ...overrides,
  } as never;
}

const context = (overrides: Record<string, unknown> = {}) => ({
  customIdSecret: secret,
  tenantId,
  webAppBaseUrl: "https://app.example.test",
  ...overrides,
});
const text = (response: APIInteractionResponse) =>
  (response.data as { content?: string } | undefined)?.content ?? "";
const buttons = (response: APIInteractionResponse) =>
  ((response.data as { components?: Array<{ components: unknown[] }> })
    ?.components?.[0]?.components ?? []) as Array<{
    custom_id?: string;
    label?: string;
    style?: ButtonStyle;
    url?: string;
  }>;
const expectEphemeral = (response: APIInteractionResponse) => {
  expect(response.type).toBe(InteractionResponseType.ChannelMessageWithSource);
  expect((response.data as { flags?: number } | undefined)?.flags).toBe(
    MessageFlags.Ephemeral,
  );
};

function validComponentId(
  setup: ReturnType<typeof harness>,
  action: DiscordCustomIdAction,
  owner: { userId?: string; guildId?: string | null; tenantId?: string } = {},
) {
  const userId = owner.userId ?? user.id;
  const scopedGuildId = owner.guildId === undefined ? guildId : owner.guildId;
  const scopedTenantId = owner.tenantId ?? tenantId;
  const customId = setup.customIds.encode(
    { action, userId, guildId: scopedGuildId, tenantId: scopedTenantId },
    { secret },
  );
  const nonce = customId.split(":")[3] ?? customId;
  setup.navigation.put({
    nonce,
    action,
    userId,
    guildId: scopedGuildId,
    tenantId: scopedTenantId,
    locale: "en",
    path: [action],
    expiresAt: new Date(Date.now() + 60_000),
  });
  return customId;
}

describe("DiscordInteractionRouter", () => {
  it("responds to PING with Pong", async () => {
    await expect(
      harness().router.route(
        {
          type: InteractionType.Ping,
          id: "1",
          application_id: "2",
          version: 1,
        } as never,
        { customIdSecret: secret },
      ),
    ).resolves.toEqual({ type: InteractionResponseType.Pong });
  });

  it("routes /account link through auth link builder and localizes by Discord locale", async () => {
    const build = vi.fn().mockResolvedValue({
      authorizationUrl: "https://example.test/auth/discord?state=opaque",
    });
    const setup = harness(new DiscordAccountService(undefined, { build }));
    const response = await setup.router.route(
      command("account", "link", { locale: "ru", guild_locale: "en-US" }),
      context(),
    );

    expectEphemeral(response);
    expect(text(response)).toContain("Используйте кнопку");
    expect(buttons(response).map((button) => button.label)).toEqual([
      "Привязать аккаунт",
      "Отмена",
    ]);
    expect(buttons(response)[0]?.url).toBe(
      "https://example.test/auth/discord?state=opaque",
    );
    expect(build).toHaveBeenCalledWith({
      userId: user.id,
      guildId,
      tenantId,
      locale: "ru",
      returnUrl: "https://app.example.test",
    });
  });

  it("returns localized link error when auth is unavailable", async () => {
    const setup = harness(
      new DiscordAccountService(undefined, {
        build: () => {
          throw new Error("auth unavailable");
        },
      }),
    );
    const response = await setup.router.route(
      command("account", "link", { locale: "ru" }),
      context(),
    );

    expectEphemeral(response);
    expect(text(response)).toBe("Не удалось привязать Discord.");
  });

  it("routes /account status for linked and unlinked accounts", async () => {
    const linkedAccount = new DiscordAccountService({
      createDiscordAuthorizationRequest: vi.fn(),
      listProviderIdentities: vi.fn().mockResolvedValue([
        {
          provider: "discord",
          providerSubject: user.id,
          displayName: "Tester",
          username: "tester",
        },
      ]),
    });
    const unlinkedAccount = new DiscordAccountService({
      createDiscordAuthorizationRequest: vi.fn(),
      listProviderIdentities: vi.fn().mockResolvedValue([]),
    });

    const linked = await harness(linkedAccount).router.route(
      command("account", "status"),
      context(),
    );
    const unlinked = await harness(unlinkedAccount).router.route(
      command("account", "status"),
      context(),
    );

    expect(text(linked)).toBe("Your Discord account is linked.");
    expect(buttons(linked).map((button) => button.label)).toEqual([
      "Unlink account",
      "Help",
    ]);
    expect(buttons(linked)[0]?.style).toBe(ButtonStyle.Danger);
    expect(text(unlinked)).toBe("Your Discord account is not linked.");
    expect(buttons(unlinked).map((button) => button.label)).toEqual([
      "Link account",
      "Help",
    ]);
    expect(buttons(unlinked)[0]?.style).toBe(ButtonStyle.Primary);
  });

  it("routes /help and falls back for unknown command, subcommand, modal, and unsupported type", async () => {
    const setup = harness();
    const help = await setup.router.route(command("help"), context());
    const unknownCommand = await setup.router.route(
      command("unknown"),
      context(),
    );
    const unknownSubcommand = await setup.router.route(
      command("account", "unlink"),
      context(),
    );
    const modal = await setup.router.route(
      {
        type: InteractionType.ModalSubmit,
        id: "1",
        application_id: "2",
        version: 1,
        token: "interaction-callback",
        locale: "ru",
        data: { custom_id: "modal" },
        user,
      } as never,
      context(),
    );
    const unsupported = await setup.router.route(
      {
        type: 99,
        id: "1",
        application_id: "2",
        version: 1,
        locale: "ru",
        user,
      } as never,
      context(),
    );

    expect(text(help)).toBe(
      "Use /link to connect your account and /status to check it.",
    );
    expect(buttons(help).map((button) => button.label)).toEqual([
      "Link account",
      "Home",
      "Open App",
    ]);
    expect(text(unknownCommand)).toBe(
      "The bot could not complete this action.",
    );
    expect(text(unknownSubcommand)).toBe(
      "The bot could not complete this action.",
    );
    expect(text(modal)).toBe("Бот не смог выполнить это действие.");
    expect(text(unsupported)).toBe("Бот не смог выполнить это действие.");
  });

  it.each([
    [
      "tampered",
      (setup: ReturnType<typeof harness>) =>
        validComponentId(setup, "home").replace(":h:", ":l:"),
    ],
    [
      "expired",
      (setup: ReturnType<typeof harness>) =>
        setup.customIds.encode(
          {
            action: "home",
            userId: user.id,
            guildId,
            tenantId,
            expiresAt: Math.floor(Date.now() / 1000) - 1,
          },
          { secret },
        ),
    ],
    [
      "wrong owner",
      (setup: ReturnType<typeof harness>) =>
        validComponentId(setup, "home", { userId: "999999999999999999" }),
    ],
    [
      "wrong guild",
      (setup: ReturnType<typeof harness>) =>
        validComponentId(setup, "home", { guildId: "345678901234567890" }),
    ],
    [
      "wrong tenant",
      (setup: ReturnType<typeof harness>) =>
        validComponentId(setup, "home", { tenantId: "1" }),
    ],
    [
      "missing nonce",
      (setup: ReturnType<typeof harness>) =>
        setup.customIds.encode(
          { action: "home", userId: user.id, guildId, tenantId },
          { secret },
        ),
    ],
  ])(
    "returns an expired component response for %s custom_id",
    async (_name, id) => {
      const setup = harness();
      const response = await setup.router.route(
        component(id(setup)),
        context(),
      );

      expectEphemeral(response);
      expect(text(response)).toBe(
        "This bot action expired. Please start again.",
      );
    },
  );

  it.each([
    ["home", "Use /link to connect your account and /status to check it."],
    ["back", "Use /link to connect your account and /status to check it."],
    ["open_app", "Use /link to connect your account and /status to check it."],
    ["link", "Use the button below to link your account."],
    ["unlink", "Could not unlink your account from the bot."],
    ["confirm", "Link your account before using this Discord action."],
  ] as const)("routes %s component action", async (action, expected) => {
    const setup = harness();
    const response = await setup.router.route(
      component(validComponentId(setup, action)),
      context(),
    );

    expectEphemeral(response);
    expect(text(response)).toBe(expected);
  });

  it("updates and clears buttons for Cancel component action", async () => {
    const setup = harness();
    const customId = validComponentId(setup, "cancel");
    const response = await setup.router.route(component(customId), context());

    expect(response.type).toBe(InteractionResponseType.UpdateMessage);
    expect(text(response)).toBe("The bot could not complete this action.");
    expect(buttons(response)).toEqual([]);
    expect(text(await setup.router.route(component(customId), context()))).toBe(
      "This bot action expired. Please start again.",
    );
  });
});
