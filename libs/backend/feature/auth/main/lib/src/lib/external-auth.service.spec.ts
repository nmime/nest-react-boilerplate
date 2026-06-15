import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AUTH_TENANT_ID,
  validateBearerAuthorization,
} from "@app/feature-auth-shared";
import { AuthService } from "./auth.service";
import { InMemoryAuthUserStore } from "./auth-user-store";
import { ExternalAuthService } from "./external-auth.service";
import {
  InMemorySocialAuthStore,
  type PersistProviderTokenInput,
} from "./social-auth-store";

const tmaMocks = vi.hoisted(() => ({
  parse: vi.fn(),
  validate: vi.fn(),
}));

const arcticMocks = vi.hoisted(() => ({
  authorizationUrl: vi.fn(),
  generateCodeVerifier: vi.fn(),
  generateState: vi.fn(),
  validateAuthorizationCode: vi.fn(),
}));

vi.mock("@tma.js/init-data-node", () => ({
  parse: tmaMocks.parse,
  validate: tmaMocks.validate,
}));

vi.mock("arctic", () => ({
  Discord: vi.fn().mockImplementation(function DiscordMock() {
    return {
      createAuthorizationURL: arcticMocks.authorizationUrl,
      validateAuthorizationCode: arcticMocks.validateAuthorizationCode,
    };
  }),
  generateCodeVerifier: arcticMocks.generateCodeVerifier,
  generateState: arcticMocks.generateState,
}));

const TEST_JWT_SECRET_VALUE = "TEST_JWT_SECRET_VALUE_at_least_32_chars";
const BOT_TOKEN = "123456:telegram-bot-token";
const DISCORD_ACCESS_VALUE = ["discord", "access", "value"].join("-");
const DISCORD_REFRESH_VALUE = ["discord", "refresh", "value"].join("-");

function signedTelegramPayload(
  overrides: Record<string, string | number> = {},
) {
  const payload: Record<string, string | number> = {
    id: 42,
    first_name: "Ada",
    username: "ada",
    auth_date: Math.floor(Date.now() / 1000),
    ...overrides,
  };
  const dataCheckString = Object.entries(payload)
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort((left, right) => left.localeCompare(right))
    .join("\n");
  const secret = createHash("sha256").update(BOT_TOKEN, "utf8").digest();
  payload.hash = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");
  return payload;
}

function createService(social = new InMemorySocialAuthStore()) {
  const users = new InMemoryAuthUserStore();
  const auth = new AuthService(users, undefined, social);
  const service = new ExternalAuthService(auth, users, social);
  return { auth, service, social, users };
}

function discordTokens(
  input: {
    accessValue?: string;
    refreshValue?: string | null;
    scopes?: string[];
    expiresAt?: Date;
  } = {},
) {
  return {
    accessToken: vi.fn(() => input.accessValue ?? DISCORD_ACCESS_VALUE),
    accessTokenExpiresAt: vi.fn(
      () => input.expiresAt ?? new Date("2026-06-14T12:10:00.000Z"),
    ),
    hasRefreshToken: vi.fn(() => input.refreshValue !== null),
    hasScopes: vi.fn(() => Boolean(input.scopes)),
    refreshToken: vi.fn(() => input.refreshValue ?? DISCORD_REFRESH_VALUE),
    scopes: vi.fn(() => input.scopes ?? []),
  };
}

class CapturingSocialAuthStore extends InMemorySocialAuthStore {
  readonly persistedProviderTokens: PersistProviderTokenInput[] = [];
  readonly createdLinkTokenHashes: string[] = [];
  revokedProviderTokenCalls = 0;

  override createLinkToken(
    input: Parameters<InMemorySocialAuthStore["createLinkToken"]>[0],
  ) {
    this.createdLinkTokenHashes.push(input.tokenHash);
    return super.createLinkToken(input);
  }

  override persistProviderToken(input: PersistProviderTokenInput) {
    this.persistedProviderTokens.push(input);
    return super.persistProviderToken(input);
  }

  override revokeProviderTokens(externalIdentityId: string, tenantId: string) {
    this.revokedProviderTokenCalls += 1;
    return super.revokeProviderTokens(externalIdentityId, tenantId);
  }
}

describe("ExternalAuthService", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env.AUTH_JWT_SECRET = TEST_JWT_SECRET_VALUE;
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    process.env.DISCORD_CLIENT_ID = "discord-client-id";
    process.env.DISCORD_CLIENT_SECRET = "discord-client-secret";
    process.env.DISCORD_REDIRECT_URI = "https://auth.example.test/callback";
    delete process.env.EXTERNAL_AUTH_AUTO_PROVISION;
    delete process.env.AUTH_TELEGRAM_ENABLED;
    delete process.env.AUTH_DISCORD_ENABLED;
    delete process.env.AUTH_ALLOWED_RETURN_URLS;
    delete process.env.TELEGRAM_WEB_LOGIN_MAX_AGE_SECONDS;
    delete process.env.TELEGRAM_TMA_MAX_AGE_SECONDS;
    delete process.env.AUTH_LINK_TOKEN_TTL_SECONDS;
    delete process.env.DISCORD_OAUTH_STATE_TTL_SECONDS;
    delete process.env.DISCORD_TOKEN_STORAGE_ENABLED;
    delete process.env.DISCORD_OAUTH_SCOPES;
    tmaMocks.parse.mockReset();
    tmaMocks.validate.mockReset();
    arcticMocks.authorizationUrl.mockReset();
    arcticMocks.authorizationUrl.mockReturnValue(
      new URL("https://discord.example.test/oauth?state=discord-state"),
    );
    arcticMocks.generateCodeVerifier.mockReset();
    arcticMocks.generateCodeVerifier.mockReturnValue("discord-code-verifier");
    arcticMocks.generateState.mockReset();
    arcticMocks.generateState.mockReturnValue("discord-state");
    arcticMocks.validateAuthorizationCode.mockReset();
    arcticMocks.validateAuthorizationCode.mockResolvedValue(discordTokens());
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              avatar: "avatar-hash",
              email: "discord@example.com",
              global_name: "Discord User",
              id: "discord-subject",
              username: "discord-user",
              verified: true,
            }),
        }),
      ),
    );
  });

  it("verifies Telegram Web Login, auto-provisions without fake email, and emits external JWT claims", async () => {
    const { service } = createService();

    const result = await service.telegramWebLogin({
      payload: signedTelegramPayload(),
    });

    expect(result.status).toBe("authenticated");
    expect(result.session?.user.email).toBeNull();
    expect(result.identity).toMatchObject({
      provider: "telegram",
      providerSubject: "42",
      channel: "telegram_web_login",
    });
    expect(
      validateBearerAuthorization(`Bearer ${result.session?.accessToken}`, {
        AUTH_JWT_SECRET: TEST_JWT_SECRET_VALUE,
      }),
    ).toMatchObject({
      amr: ["telegram"],
      authProvider: "telegram",
      authChannel: "telegram_web_login",
      externalIdentityId: result.identity?.id,
    });
  });

  it("rejects invalid Telegram signatures and returns needs-link when auto provision is disabled", async () => {
    const { service } = createService();

    await expect(
      service.telegramWebLogin({
        payload: { ...signedTelegramPayload(), hash: "00" },
      }),
    ).rejects.toThrow("invalid_signature");

    process.env.EXTERNAL_AUTH_AUTO_PROVISION = "false";
    await expect(
      service.telegramWebLogin({ payload: signedTelegramPayload({ id: 43 }) }),
    ).resolves.toMatchObject({ status: "needs_link", code: "needs_link" });
  });

  it("creates hashed one-time link tokens and links a Telegram identity", async () => {
    const { auth, service } = createService();
    const passwordSession = await auth.register({
      email: "link@example.com",
      password: "password123",
    });

    const linkToken = await service.createLinkToken({
      userId: passwordSession.user.id,
      provider: "telegram",
    });
    expect(linkToken.token).toHaveLength(43);

    await expect(
      service.telegramBotLink({
        linkToken: linkToken.token,
        providerSubject: "99",
        username: "linked",
      }),
    ).resolves.toMatchObject({
      status: "linked",
      identity: { providerSubject: "99", channel: "telegram_bot" },
    });

    await expect(
      service.telegramBotLink({
        linkToken: linkToken.token,
        providerSubject: "99",
      }),
    ).rejects.toThrow("link_token_expired");
  });

  it("rejects Telegram Web Login with missing, stale, malformed, and timing-safe mismatched signatures", async () => {
    const { service } = createService();

    const staleAuthDate = Math.floor(Date.now() / 1000) - 120;
    process.env.TELEGRAM_WEB_LOGIN_MAX_AGE_SECONDS = "60";

    await expect(
      service.telegramWebLogin({
        payload: { ...signedTelegramPayload(), hash: "" },
      }),
    ).rejects.toThrow("invalid_signature");
    await expect(
      service.telegramWebLogin({
        payload: signedTelegramPayload({ auth_date: staleAuthDate }),
      }),
    ).rejects.toThrow("invalid_signature");
    await expect(
      service.telegramWebLogin({
        payload: signedTelegramPayload({ auth_date: "not-a-number" }),
      }),
    ).rejects.toThrow("invalid_signature");
    await expect(
      service.telegramWebLogin({
        payload: { ...signedTelegramPayload(), hash: "a".repeat(64) },
      }),
    ).rejects.toThrow("invalid_signature");
    await expect(
      service.telegramWebLogin({
        payload: { ...signedTelegramPayload(), hash: "aa" },
      }),
    ).rejects.toThrow("invalid_signature");
  });

  it("maps provider disabled and missing Telegram configuration to stable errors", async () => {
    const { service } = createService();

    process.env.AUTH_TELEGRAM_ENABLED = "false";
    await expect(
      service.telegramWebLogin({ payload: signedTelegramPayload() }),
    ).rejects.toThrow("provider_disabled");

    delete process.env.AUTH_TELEGRAM_ENABLED;
    delete process.env.TELEGRAM_BOT_TOKEN;
    await expect(
      service.telegramWebLogin({ payload: signedTelegramPayload() }),
    ).rejects.toThrow("provider_not_configured");
  });

  it("validates raw TMA initData before parsing and maps invalid initData to a stable error", async () => {
    const { service } = createService();
    tmaMocks.validate.mockImplementation(() => {
      throw new Error("bad init data");
    });

    await expect(
      service.telegramTma({ initData: "query_id=raw&user=untrusted" }),
    ).rejects.toThrow("invalid_signature");

    expect(tmaMocks.validate).toHaveBeenCalledWith(
      "query_id=raw&user=untrusted",
      BOT_TOKEN,
      { expiresIn: 86_400 },
    );
    expect(tmaMocks.parse).not.toHaveBeenCalled();
  });

  it("uses validated TMA parsed data for identity and preserves start_param link intent metadata", async () => {
    const { service, social } = createService();
    tmaMocks.parse.mockReturnValue({
      start_param: "link-intent-42",
      user: {
        first_name: "Ada",
        id: 777,
        language_code: "ru",
        last_name: "Lovelace",
        photo_url: "https://cdn.example.test/avatar.png",
        username: "ada",
      },
    });

    const result = await service.telegramTma({
      initData: "signed-init-data",
      returnUrl: null,
    });
    const identity = await social.findIdentity(
      "telegram",
      "777",
      DEFAULT_AUTH_TENANT_ID,
    );

    expect(result).toMatchObject({
      status: "authenticated",
      identity: {
        avatarUrl: "https://cdn.example.test/avatar.png",
        channel: "telegram_tma",
        displayName: "Ada Lovelace",
        providerSubject: "777",
        username: "ada",
      },
    });
    expect(identity._unsafeUnwrap()?.profileMetadata).toEqual({
      source: "telegram_tma",
      startParam: "link-intent-42",
    });
  });

  it("stores Discord state with PKCE, validates callback state once, and rejects replay", async () => {
    const { service } = createService();

    const authorization = service.createDiscordAuthorizationRequest({});

    expect(authorization.authorizationUrl).toContain("discord.example.test");
    expect(arcticMocks.authorizationUrl).toHaveBeenCalledWith(
      "discord-state",
      "discord-code-verifier",
      ["identify", "email"],
    );

    await expect(
      service.discordCallback({ code: "callback-code", state: "wrong-state" }),
    ).rejects.toThrow("invalid_state");

    await expect(
      service.discordCallback({
        code: "callback-code",
        state: "discord-state",
      }),
    ).resolves.toMatchObject({
      identity: {
        channel: "discord_oauth",
        providerSubject: "discord-subject",
      },
      status: "authenticated",
    });
    expect(arcticMocks.validateAuthorizationCode).toHaveBeenCalledWith(
      "callback-code",
      "discord-code-verifier",
    );

    await expect(
      service.discordCallback({
        code: "callback-code",
        state: "discord-state",
      }),
    ).rejects.toThrow("invalid_state");
  });

  it("rejects expired Discord callback state and disallowed return URLs", async () => {
    const { service } = createService();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T12:00:00.000Z"));
    process.env.DISCORD_OAUTH_STATE_TTL_SECONDS = "1";

    service.createDiscordAuthorizationRequest({});
    vi.setSystemTime(new Date("2026-06-14T12:00:02.000Z"));

    await expect(
      service.discordCallback({
        code: "callback-code",
        state: "discord-state",
      }),
    ).rejects.toThrow("invalid_state");

    vi.useRealTimers();
    process.env.AUTH_ALLOWED_RETURN_URLS = "https://app.example.test/";
    expect(() =>
      service.createDiscordAuthorizationRequest({
        returnUrl: "https://evil.example.test/callback",
      }),
    ).toThrow("return_url_not_allowed");
  });

  it("maps Discord provider disabled and missing configuration to stable errors", () => {
    const { service } = createService();

    process.env.AUTH_DISCORD_ENABLED = "false";
    expect(() => service.createDiscordAuthorizationRequest({})).toThrow(
      "provider_disabled",
    );

    delete process.env.AUTH_DISCORD_ENABLED;
    delete process.env.DISCORD_CLIENT_SECRET;
    expect(() => service.createDiscordAuthorizationRequest({})).toThrow(
      "provider_not_configured",
    );
  });

  it("maps Discord verified versus unverified email without trusting unverified email for users", async () => {
    const { service } = createService();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          email: "unverified@example.com",
          id: "discord-unverified",
          username: "discord-unverified",
          verified: false,
        }),
    } as Response);

    service.createDiscordAuthorizationRequest({});
    const unverified = await service.discordCallback({
      code: "callback-code",
      state: "discord-state",
    });

    expect(unverified.identity).toMatchObject({
      email: null,
      emailVerified: false,
      providerSubject: "discord-unverified",
    });
    expect(unverified.session?.user.email).toBeNull();

    arcticMocks.generateState.mockReturnValueOnce("discord-state-2");
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          email: "verified@example.com",
          global_name: "Verified User",
          id: "discord-verified",
          username: "discord-verified",
          verified: true,
        }),
    } as Response);

    service.createDiscordAuthorizationRequest({});
    const verified = await service.discordCallback({
      code: "callback-code",
      state: "discord-state-2",
    });

    expect(verified.identity).toMatchObject({
      email: "verified@example.com",
      emailVerified: true,
    });
    expect(verified.session?.user.email).toBe("verified@example.com");
  });

  it("honors Discord provider token storage toggle and keeps provider tokens out of responses", async () => {
    const social = new CapturingSocialAuthStore();
    const { service } = createService(social);

    service.createDiscordAuthorizationRequest({});
    const disabled = await service.discordCallback({
      code: "callback-code",
      state: "discord-state",
    });

    expect(social.persistedProviderTokens).toHaveLength(0);
    expect(JSON.stringify(disabled)).not.toContain(DISCORD_ACCESS_VALUE);
    expect(JSON.stringify(disabled)).not.toContain(DISCORD_REFRESH_VALUE);

    arcticMocks.generateState.mockReturnValueOnce("discord-state-2");
    arcticMocks.validateAuthorizationCode.mockResolvedValueOnce(
      discordTokens({ scopes: ["identify", "email"] }),
    );
    process.env.DISCORD_TOKEN_STORAGE_ENABLED = "true";
    service.createDiscordAuthorizationRequest({});
    const enabled = await service.discordCallback({
      code: "callback-code",
      state: "discord-state-2",
    });

    expect(social.persistedProviderTokens).toEqual([
      expect.objectContaining({
        plaintext: DISCORD_ACCESS_VALUE,
        provider: "discord",
        scopes: ["identify", "email"],
        tokenKind: "access",
      }),
      expect.objectContaining({
        plaintext: DISCORD_REFRESH_VALUE,
        provider: "discord",
        scopes: ["identify", "email"],
        tokenKind: "refresh",
      }),
    ]);
    expect(JSON.stringify(enabled)).not.toContain(DISCORD_ACCESS_VALUE);
    expect(JSON.stringify(enabled)).not.toContain(DISCORD_REFRESH_VALUE);
  });

  it("enforces link token TTL, purpose, revoke, replay, and hash-only persistence", async () => {
    const social = new CapturingSocialAuthStore();
    const { auth, service } = createService(social);
    const passwordSession = await auth.register({
      email: "hash-link@example.com",
      password: "password123",
    });

    process.env.AUTH_LINK_TOKEN_TTL_SECONDS = "1";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T12:00:00.000Z"));
    const expiring = await service.createLinkToken({
      intent: "link",
      provider: "telegram",
      userId: passwordSession.user.id,
    });

    expect(social.createdLinkTokenHashes[0]).toHaveLength(64);
    expect(social.createdLinkTokenHashes[0]).not.toBe(expiring.token);
    await expect(
      social.consumeLinkToken(
        social.createdLinkTokenHashes[0],
        "login",
        DEFAULT_AUTH_TENANT_ID,
        new Date(),
      ),
    ).resolves.toMatchObject({ value: null });

    vi.setSystemTime(new Date("2026-06-14T12:00:02.000Z"));
    await expect(
      service.telegramBotLink({
        linkToken: expiring.token,
        providerSubject: "501",
      }),
    ).rejects.toThrow("link_token_expired");

    vi.setSystemTime(new Date("2026-06-14T12:01:00.000Z"));
    const revoked = await service.createLinkToken({
      provider: "telegram",
      userId: passwordSession.user.id,
    });
    await expect(
      social.revokeLinkToken(
        social.createdLinkTokenHashes.at(-1) ?? "missing-hash",
        DEFAULT_AUTH_TENANT_ID,
        new Date(),
      ),
    ).resolves.toMatchObject({ value: true });
    await expect(
      service.telegramBotLink({
        linkToken: revoked.token,
        providerSubject: "502",
      }),
    ).rejects.toThrow("link_token_expired");

    const usable = await service.createLinkToken({
      provider: "telegram",
      userId: passwordSession.user.id,
    });
    await expect(
      service.telegramBotLink({
        linkToken: usable.token,
        providerSubject: "503",
      }),
    ).resolves.toMatchObject({ status: "linked" });
    await expect(
      service.telegramBotLink({
        linkToken: usable.token,
        providerSubject: "504",
      }),
    ).rejects.toThrow("link_token_expired");
  });

  it("hides provider identity conflicts and requires recent auth plus another usable method before unlink", async () => {
    const social = new CapturingSocialAuthStore();
    const { auth, service } = createService(social);
    const first = await auth.register({
      email: "first@example.com",
      password: "password123",
    });
    const second = await auth.register({
      email: "second@example.com",
      password: "password123",
    });
    const linked = await social.upsertIdentity({
      channel: "telegram_bot",
      email: null,
      provider: "telegram",
      providerSubject: "conflict-subject",
      tenantId: DEFAULT_AUTH_TENANT_ID,
      userId: first.user.id,
    });

    await expect(
      service.telegramBotLink({
        linkToken: (
          await service.createLinkToken({
            provider: "telegram",
            userId: second.user.id,
          })
        ).token,
        providerSubject: "conflict-subject",
      }),
    ).resolves.toMatchObject({
      code: "account_conflict",
      message: "Provider identity cannot be linked.",
      status: "conflict",
    });

    await expect(
      service.unlinkProviderIdentity(linked._unsafeUnwrap().id, {
        subject: first.user.id,
        tenantId: DEFAULT_AUTH_TENANT_ID,
      }),
    ).rejects.toThrow("step_up_required");

    await expect(
      service.unlinkProviderIdentity(linked._unsafeUnwrap().id, {
        authTime: Math.floor(Date.now() / 1000),
        subject: first.user.id,
        tenantId: DEFAULT_AUTH_TENANT_ID,
      }),
    ).rejects.toThrow("last_method_unlink_forbidden");

    await social.upsertMethod({
      amr: ["pwd"],
      externalIdentityId: linked._unsafeUnwrap().id,
      method: "telegram_bot",
      tenantId: DEFAULT_AUTH_TENANT_ID,
      userId: first.user.id,
    });
    await expect(
      service.unlinkProviderIdentity(linked._unsafeUnwrap().id, {
        authTime: Math.floor(Date.now() / 1000),
        subject: first.user.id,
        tenantId: DEFAULT_AUTH_TENANT_ID,
      }),
    ).resolves.toEqual({ unlinked: true });
    expect(social.revokedProviderTokenCalls).toBe(1);
  });

  it("keeps password session claims backward compatible and maps nullable external email claims", async () => {
    const { auth, service } = createService();
    const passwordSession = await auth.register({
      email: "claims@example.com",
      password: "password123",
    });

    expect(passwordSession).toMatchObject({
      amr: ["pwd"],
      authChannel: "password",
      authProvider: "password",
    });

    const external = service.createSessionWithClaims(
      {
        email: null,
        id: "external-user-id",
        passwordHash: "hash",
        permissions: ["profile:read"],
        roles: ["user"],
        status: "active",
        tenantId: DEFAULT_AUTH_TENANT_ID,
        theme: "system",
      },
      {
        amr: ["telegram"],
        authChannel: "telegram_tma",
        authProvider: "telegram",
        authTime: 1_797_204_800,
        externalIdentityId: "external-identity-id",
      },
      { AUTH_JWT_SECRET: TEST_JWT_SECRET_VALUE },
    );

    expect(external.user.email).toBeNull();
    expect(
      validateBearerAuthorization(`Bearer ${external.accessToken}`, {
        AUTH_JWT_SECRET: TEST_JWT_SECRET_VALUE,
      }),
    ).toMatchObject({
      amr: ["telegram"],
      authChannel: "telegram_tma",
      authProvider: "telegram",
      email: null,
      externalIdentityId: "external-identity-id",
      subject: "external-user-id",
    });
  });
});
