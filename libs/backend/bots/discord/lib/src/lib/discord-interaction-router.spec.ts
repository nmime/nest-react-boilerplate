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
const expectUpdate = (response: APIInteractionResponse) => {
  expect(response.type).toBe(InteractionResponseType.UpdateMessage);
  expect((response.data as { flags?: number } | undefined)?.flags).toBe(
    undefined,
  );
};

function validComponentId(
  setup: ReturnType<typeof harness>,
  action: DiscordCustomIdAction,
  owner: { userId?: string; guildId?: string | null; tenantId?: string } = {},
  options: { expiresAt?: Date } = {},
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
    expiresAt: options.expiresAt ?? new Date(Date.now() + 60_000),
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
    expect(text(response)).toContain("привязать аккаунт Discord");
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

  it("returns actionable missing-config text instead of a broken link URL", async () => {
    const setup = harness(new DiscordAccountService());
    const response = await setup.router.route(
      command("account", "link"),
      context({ webAppBaseUrl: undefined }),
    );

    expectEphemeral(response);
    expect(text(response)).toContain("not configured yet");
    expect(text(response)).toContain("Discord auth");
    expect(buttons(response).map((button) => button.label)).toEqual([
      "Back",
      "Home",
    ]);
    expect(JSON.stringify(response)).not.toMatch(/api[-_ ]?root/iu);
    expect(buttons(response).some((button) => Boolean(button.url))).toBe(false);
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

  it("routes /account status for linked and unlinked accounts with localized components", async () => {
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
      command("account", "status", { locale: "ru" }),
      context(),
    );

    expectEphemeral(linked);
    expect(text(linked)).toBe("Your Discord account is linked.");
    expect(buttons(linked).map((button) => button.label)).toEqual([
      "Unlink account",
      "Home",
    ]);
    expect(buttons(linked)[0]?.style).toBe(ButtonStyle.Danger);
    expectEphemeral(unlinked);
    expect(text(unlinked)).toBe("Ваш аккаунт Discord не привязан.");
    expect(buttons(unlinked).map((button) => button.label)).toEqual([
      "Привязать аккаунт",
      "Домой",
    ]);
    expect(buttons(unlinked)[0]?.style).toBe(ButtonStyle.Primary);
  });

  it("routes /help with configured and missing app URLs without broken buttons", async () => {
    const setup = harness();
    const help = await setup.router.route(command("help"), context());
    const missingApp = await setup.router.route(
      command("help"),
      context({ webAppBaseUrl: undefined }),
    );

    expectEphemeral(help);
    expect(text(help)).toBe(
      "Use /account link to connect your Discord account and /account status to check it.",
    );
    expect(buttons(help).map((button) => button.label)).toEqual([
      "Link account",
      "Check status",
      "Home",
      "Open App",
    ]);
    expect(buttons(help)[3]?.url).toBe("https://app.example.test");
    expect(JSON.stringify(help)).not.toMatch(/api[-_ ]?root/iu);

    expectEphemeral(missingApp);
    expect(buttons(missingApp).map((button) => button.label)).toEqual([
      "Link account",
      "Check status",
      "Home",
      "Open App",
    ]);
    expect(buttons(missingApp)[3]?.custom_id).toEqual(expect.any(String));
    expect(buttons(missingApp)[3]?.url).toBeUndefined();
  });

  it("falls back for unknown command, subcommand, modal, and unsupported type", async () => {
    const setup = harness();
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
      "This bot action could not be verified. Please start again.",
    ],
    [
      "expired custom_id",
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
      "This bot action expired. Please start again.",
    ],
    [
      "expired navigation state",
      (setup: ReturnType<typeof harness>) =>
        validComponentId(
          setup,
          "home",
          {},
          {
            expiresAt: new Date(Date.now() - 1_000),
          },
        ),
      "This bot action expired. Please start again.",
    ],
    [
      "wrong owner",
      (setup: ReturnType<typeof harness>) =>
        validComponentId(setup, "home", { userId: "999999999999999999" }),
      "This bot action belongs to another Discord user.",
    ],
    [
      "wrong guild",
      (setup: ReturnType<typeof harness>) =>
        validComponentId(setup, "home", { guildId: "345678901234567890" }),
      "This bot action belongs to another Discord server.",
    ],
    [
      "wrong tenant",
      (setup: ReturnType<typeof harness>) =>
        validComponentId(setup, "home", { tenantId: "1" }),
      "This bot action belongs to another workspace.",
    ],
    [
      "missing nonce",
      (setup: ReturnType<typeof harness>) =>
        setup.customIds.encode(
          { action: "home", userId: user.id, guildId, tenantId },
          { secret },
        ),
      "This bot action expired. Please start again.",
    ],
  ])(
    "returns localized ephemeral component error for %s custom_id",
    async (_name, id, expected) => {
      const setup = harness();
      const response = await setup.router.route(
        component(id(setup)),
        context(),
      );

      expectEphemeral(response);
      expect(text(response)).toBe(expected);
    },
  );

  it.each([
    [
      "home",
      "Use /account link to connect your Discord account and /account status to check it.",
    ],
    ["back", "Your Discord account is not linked."],
    ["link", "Use the button below to link your Discord account."],
    [
      "unlink",
      "Confirm that you want to unlink your Discord account from this workspace.",
    ],
    ["confirm", "Could not unlink your account from the bot."],
  ] as const)(
    "updates the existing message for %s component action",
    async (action, expected) => {
      const setup = harness();
      const response = await setup.router.route(
        component(validComponentId(setup, action)),
        context(),
      );

      expectUpdate(response);
      expect(text(response)).toBe(expected);
    },
  );

  it("uses an ephemeral actionable error for Open App when the app URL is missing", async () => {
    const setup = harness();
    const response = await setup.router.route(
      component(validComponentId(setup, "open_app")),
      context({ webAppBaseUrl: undefined }),
    );

    expectEphemeral(response);
    expect(text(response)).toContain("web app URL is not configured");
    expect(text(response)).toContain("/account link");
    expect(JSON.stringify(response)).not.toMatch(/api[-_ ]?root/iu);
  });

  it("updates and clears buttons for Cancel component action", async () => {
    const setup = harness();
    const customId = validComponentId(setup, "cancel");
    const response = await setup.router.route(component(customId), context());

    expectUpdate(response);
    expect(text(response)).toBe("Action cancelled.");
    expect(buttons(response)).toEqual([]);
    expect(text(await setup.router.route(component(customId), context()))).toBe(
      "This bot action expired. Please start again.",
    );
  });

  it("does not render raw template delimiters in Discord responses", async () => {
    const setup = harness();
    const openDelimiter = ["{", "{"].join("");
    const closeDelimiter = ["}", "}"].join("");
    const responses = await Promise.all([
      setup.router.route(command("help"), context()),
      setup.router.route(command("account", "status"), context()),
      setup.router.route(command("account", "link"), context()),
      setup.router.route(
        component(validComponentId(setup, "open_app")),
        context({ webAppBaseUrl: undefined }),
      ),
    ]);

    for (const response of responses) {
      const rendered = [
        text(response),
        ...buttons(response).flatMap((button) => [button.label, button.url]),
      ].join("\n");
      expect(rendered).not.toContain(openDelimiter);
      expect(rendered).not.toContain(closeDelimiter);
    }
  });
});
