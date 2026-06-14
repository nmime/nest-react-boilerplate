import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import { validateBearerAuthorization } from "@app/feature-auth-shared";
import { AuthService } from "./auth.service";
import { InMemoryAuthUserStore } from "./auth-user-store";
import { ExternalAuthService } from "./external-auth.service";
import { InMemorySocialAuthStore } from "./social-auth-store";

const TEST_JWT_SECRET_VALUE = "TEST_JWT_SECRET_VALUE_at_least_32_chars";
const BOT_TOKEN = "123456:telegram-bot-token";

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

describe("ExternalAuthService", () => {
  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = TEST_JWT_SECRET_VALUE;
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    delete process.env.EXTERNAL_AUTH_AUTO_PROVISION;
  });

  it("verifies Telegram Web Login, auto-provisions without fake email, and emits external JWT claims", async () => {
    const users = new InMemoryAuthUserStore();
    const service = new ExternalAuthService(
      new AuthService(users),
      users,
      new InMemorySocialAuthStore(),
    );

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
    const users = new InMemoryAuthUserStore();
    const service = new ExternalAuthService(
      new AuthService(users),
      users,
      new InMemorySocialAuthStore(),
    );

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
    const users = new InMemoryAuthUserStore();
    const auth = new AuthService(users);
    const social = new InMemorySocialAuthStore();
    const service = new ExternalAuthService(auth, users, social);
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
});
