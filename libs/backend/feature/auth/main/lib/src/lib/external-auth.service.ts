import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Discord, generateCodeVerifier, generateState } from "arctic";
import {
  parse as parseTmaInitData,
  validate as validateTmaInitData,
} from "@tma.js/init-data-node";
import {
  createDefaultAccessPolicy,
  type AuthProvider,
  type AuthProviderChannel,
  type AuthSessionView,
  type ExternalAuthIdentityView,
  type ExternalAuthIntent,
  type ExternalAuthProvider,
  type ExternalAuthProviderChannel,
  type LinkTokenResult,
} from "@app/feature-auth-shared";
import type { OAuth2Tokens } from "arctic";
import {
  AuthService,
  hashPassword,
  parseTenantId,
  type JwtSigningEnvironment,
} from "./auth.service";
import {
  AUTH_USER_STORE,
  type AuthUserRecord,
  type AuthUserStore,
} from "./auth-user-store";
import {
  SOCIAL_AUTH_STORE,
  InMemorySocialAuthStore,
  type ExternalIdentityRecord,
  type SocialAuthStore,
} from "./social-auth-store";

const DefaultLinkTokenTtlSeconds = 10 * 60;
const DefaultDiscordStateTtlSeconds = 10 * 60;
const DefaultTelegramMaxAgeSeconds = 24 * 60 * 60;
const ExternalAccountPasswordSeed = [
  "external-auth-account",
  "without-local-credential",
].join(":");

export interface ExternalAuthSessionClaims {
  amr: string[];
  authProvider: AuthProvider;
  authChannel: AuthProviderChannel;
  authTime: number;
  externalIdentityId?: string;
}

export interface TelegramWebLoginInput {
  tenantId?: string | null;
  intent?: ExternalAuthIntent;
  linkToken?: string | null;
  returnUrl?: string | null;
  payload: Record<string, string | number | boolean | null | undefined>;
  principal?: { subject: string; tenantId: string } | null;
}

export interface TelegramTmaInput {
  tenantId?: string | null;
  intent?: ExternalAuthIntent;
  initData: string;
  linkToken?: string | null;
  returnUrl?: string | null;
  principal?: { subject: string; tenantId: string } | null;
}

export interface TelegramBotLinkInput {
  tenantId?: string | null;
  linkToken: string;
  providerSubject: string;
  username?: string | null;
  displayName?: string | null;
  locale?: string | null;
  avatarUrl?: string | null;
}

export interface DiscordAuthorizationRequestInput {
  tenantId?: string | null;
  intent?: ExternalAuthIntent;
  linkToken?: string | null;
  returnUrl?: string | null;
  principal?: { subject: string; tenantId: string } | null;
}

export interface DiscordCallbackInput {
  tenantId?: string | null;
  code?: string | null;
  state?: string | null;
  principal?: { subject: string; tenantId: string } | null;
}

export interface DiscordAuthorizationRequestResult {
  authorizationUrl: string;
  stateExpiresAt: string;
}

export interface ExternalAuthLoginResult {
  status: "authenticated" | "linked" | "needs_link" | "conflict";
  code?: string;
  message?: string;
  session?: AuthSessionView;
  identity?: ExternalAuthIdentityView;
  returnUrl?: string;
}

interface VerifiedExternalProfile {
  provider: ExternalAuthProvider;
  channel: ExternalAuthProviderChannel;
  providerSubject: string;
  email?: string | null;
  emailVerified?: boolean | null;
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
  metadata?: Record<string, unknown>;
}

interface StoredDiscordState {
  tenantId: string;
  stateHash: string;
  codeVerifier: string;
  intent: ExternalAuthIntent;
  linkToken?: string;
  returnUrl?: string;
  userId?: string;
  expiresAt: Date;
}

@Injectable()
export class ExternalAuthService {
  private readonly discordStates = new Map<string, StoredDiscordState>();

  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_USER_STORE)
    private readonly users: AuthUserStore,
    @Optional()
    @Inject(SOCIAL_AUTH_STORE)
    private readonly social: SocialAuthStore = new InMemorySocialAuthStore(),
  ) {}

  async telegramWebLogin(
    input: TelegramWebLoginInput,
  ): Promise<ExternalAuthLoginResult> {
    assertProviderEnabled("telegram");
    const botToken = requireEnv(
      "TELEGRAM_BOT_TOKEN",
      "provider_not_configured",
    );
    const profile = verifyTelegramWebLoginPayload(input.payload, botToken);
    return this.resolveVerifiedProfile({
      tenantId: parseTenantId(input.tenantId),
      intent: input.intent ?? "login",
      linkToken: input.linkToken,
      returnUrl: input.returnUrl,
      principal: input.principal,
      profile,
    });
  }

  async telegramTma(input: TelegramTmaInput): Promise<ExternalAuthLoginResult> {
    assertProviderEnabled("telegram");
    const botToken = requireEnv(
      "TELEGRAM_BOT_TOKEN",
      "provider_not_configured",
    );
    try {
      validateTmaInitData(input.initData, botToken, {
        expiresIn: readPositiveInt(
          process.env.TELEGRAM_TMA_MAX_AGE_SECONDS,
          DefaultTelegramMaxAgeSeconds,
        ),
      });
    } catch {
      throw new UnauthorizedException("invalid_signature");
    }
    const initData = parseTmaInitData(input.initData);
    if (!initData.user?.id) {
      throw new BadRequestException("invalid_signature");
    }
    const user = initData.user;
    const displayName =
      [user.first_name, user.last_name].filter(Boolean).join(" ") || null;
    return this.resolveVerifiedProfile({
      tenantId: parseTenantId(input.tenantId),
      intent: input.intent ?? "login",
      linkToken: input.linkToken,
      returnUrl: input.returnUrl,
      principal: input.principal,
      profile: {
        provider: "telegram",
        channel: "telegram_tma",
        providerSubject: String(user.id),
        displayName,
        username: user.username ?? null,
        avatarUrl: user.photo_url ?? null,
        locale: user.language_code ?? null,
        metadata: {
          source: "telegram_tma",
          startParam: initData.start_param ?? null,
        },
      },
    });
  }

  async telegramBotLink(
    input: TelegramBotLinkInput,
  ): Promise<ExternalAuthLoginResult> {
    assertProviderEnabled("telegram");
    const tenantId = parseTenantId(input.tenantId);
    const consumed = await this.consumeLinkTokenOrThrow(
      input.linkToken,
      "link",
      tenantId,
    );
    if (!consumed.userId) {
      throw new UnauthorizedException("link_token_expired");
    }
    return this.linkProfileToUser({
      tenantId,
      userId: consumed.userId,
      profile: {
        provider: "telegram",
        channel: "telegram_bot",
        providerSubject: input.providerSubject,
        username: input.username,
        displayName: input.displayName,
        locale: input.locale,
        avatarUrl: input.avatarUrl,
        metadata: { source: "telegram_bot" },
      },
    });
  }

  async createLinkToken(input: {
    tenantId?: string | null;
    userId: string;
    provider: ExternalAuthProvider;
    intent?: ExternalAuthIntent;
    returnUrl?: string | null;
  }): Promise<LinkTokenResult> {
    const tenantId = parseTenantId(input.tenantId);
    assertReturnUrlAllowed(input.returnUrl);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Date.now() +
        readPositiveInt(
          process.env.AUTH_LINK_TOKEN_TTL_SECONDS,
          DefaultLinkTokenTtlSeconds,
        ) *
          1000,
    );
    const created = await this.social.createLinkToken({
      tenantId,
      userId: input.userId,
      provider: input.provider,
      purpose: input.intent ?? "link",
      tokenHash: hashOpaqueToken(token),
      deepLinkMetadata: input.returnUrl ? { returnUrl: input.returnUrl } : {},
      expiresAt,
    });
    if (created.isErr()) {
      throw new ConflictException(created.error.message);
    }
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      provider: input.provider,
      intent: input.intent ?? "link",
    };
  }

  async listProviderIdentities(
    userId: string,
    tenantIdInput?: string | null,
  ): Promise<ExternalAuthIdentityView[]> {
    const tenantId = parseTenantId(tenantIdInput);
    const identities = await this.social.listIdentities(userId, tenantId);
    if (identities.isErr()) {
      throw new ConflictException(identities.error.message);
    }
    return identities.value.map(toIdentityView);
  }

  async unlinkProviderIdentity(
    identityId: string,
    principal: { subject: string; tenantId: string; authTime?: number },
  ): Promise<{ unlinked: boolean }> {
    const tenantId = parseTenantId(principal.tenantId);
    if (!isRecentAuthTime(principal.authTime)) {
      throw new ForbiddenException("step_up_required");
    }
    const count = await this.social.countMethods(principal.subject, tenantId);
    if (count.isErr()) {
      throw new ConflictException(count.error.message);
    }
    if (count.value <= 1) {
      throw new ForbiddenException("last_method_unlink_forbidden");
    }
    await this.social.revokeProviderTokens(identityId, tenantId);
    const deleted = await this.social.deleteIdentity(
      identityId,
      principal.subject,
      tenantId,
    );
    if (deleted.isErr()) {
      throw new ConflictException(deleted.error.message);
    }
    return { unlinked: deleted.value };
  }

  createDiscordAuthorizationRequest(
    input: DiscordAuthorizationRequestInput,
  ): DiscordAuthorizationRequestResult {
    assertProviderEnabled("discord");
    const tenantId = parseTenantId(input.tenantId);
    assertReturnUrlAllowed(input.returnUrl);
    const provider = createDiscordProvider();
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const intent = input.intent ?? "login";
    const expiresAt = new Date(
      Date.now() +
        readPositiveInt(
          process.env.DISCORD_OAUTH_STATE_TTL_SECONDS,
          DefaultDiscordStateTtlSeconds,
        ) *
          1000,
    );
    this.discordStates.set(hashOpaqueToken(state), {
      tenantId,
      stateHash: hashOpaqueToken(state),
      codeVerifier,
      intent,
      linkToken: input.linkToken ?? undefined,
      returnUrl: input.returnUrl ?? undefined,
      userId: input.principal?.subject,
      expiresAt,
    });
    const scopes = readList(process.env.DISCORD_OAUTH_SCOPES) ?? [
      "identify",
      "email",
    ];
    const authorizationUrl = provider.createAuthorizationURL(
      state,
      codeVerifier,
      scopes,
    );
    return {
      authorizationUrl: authorizationUrl.toString(),
      stateExpiresAt: expiresAt.toISOString(),
    };
  }

  async discordCallback(
    input: DiscordCallbackInput,
  ): Promise<ExternalAuthLoginResult> {
    assertProviderEnabled("discord");
    if (!input.code || !input.state) {
      throw new UnauthorizedException("invalid_state");
    }
    const stateHash = hashOpaqueToken(input.state);
    const stored = this.discordStates.get(stateHash);
    this.discordStates.delete(stateHash);
    if (!stored || stored.expiresAt <= new Date()) {
      throw new UnauthorizedException("invalid_state");
    }
    const tokens = await createDiscordProvider().validateAuthorizationCode(
      input.code,
      stored.codeVerifier,
    );
    const discordUser = await fetchDiscordUser(tokens.accessToken());
    const profile: VerifiedExternalProfile = {
      provider: "discord",
      channel: "discord_oauth",
      providerSubject: discordUser.id,
      email: discordUser.verified ? discordUser.email : null,
      emailVerified: discordUser.verified ?? false,
      displayName: discordUser.global_name ?? discordUser.username ?? null,
      username: discordUser.username ?? null,
      avatarUrl: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null,
      metadata: { source: "discord_oauth" },
    };
    const result = await this.resolveVerifiedProfile({
      tenantId: stored.tenantId,
      intent: stored.intent,
      linkToken: stored.linkToken,
      returnUrl: stored.returnUrl,
      principal:
        input.principal ??
        (stored.userId
          ? { subject: stored.userId, tenantId: stored.tenantId }
          : null),
      profile,
      discordTokens: tokens,
    });
    return result;
  }

  private async resolveVerifiedProfile(input: {
    tenantId: string;
    intent: ExternalAuthIntent;
    linkToken?: string | null;
    returnUrl?: string | null;
    principal?: { subject: string; tenantId: string } | null;
    profile: VerifiedExternalProfile;
    discordTokens?: OAuth2Tokens;
  }): Promise<ExternalAuthLoginResult> {
    assertReturnUrlAllowed(input.returnUrl);
    if (input.intent === "link") {
      const userId =
        input.principal?.subject ??
        (input.linkToken
          ? (
              await this.consumeLinkTokenOrThrow(
                input.linkToken,
                "link",
                input.tenantId,
              )
            ).userId
          : null);
      if (!userId) {
        throw new UnauthorizedException("link_token_expired");
      }
      return this.linkProfileToUser({
        tenantId: input.tenantId,
        userId,
        profile: input.profile,
        returnUrl: input.returnUrl,
        discordTokens: input.discordTokens,
      });
    }

    const existing = await this.social.findIdentity(
      input.profile.provider,
      input.profile.providerSubject,
      input.tenantId,
    );
    if (existing.isErr()) {
      throw new ConflictException(existing.error.message);
    }
    if (existing.value) {
      const user = await this.requireActiveUser(
        existing.value.userId,
        input.tenantId,
      );
      const identity = await this.social.upsertIdentity({
        ...profileToIdentityInput(input.profile, input.tenantId, user.id),
        lastAuthenticatedAt: new Date(),
      });
      if (identity.isErr()) {
        throw new ConflictException(identity.error.message);
      }
      await this.recordMethod(
        user.id,
        input.tenantId,
        input.profile.channel,
        identity.value.id,
      );
      await this.persistDiscordTokensIfConfigured(
        user.id,
        input.tenantId,
        identity.value.id,
        input.discordTokens,
      );
      return {
        status: "authenticated",
        session: this.createExternalSession(
          user,
          input.profile,
          identity.value.id,
        ),
        identity: toIdentityView(identity.value),
        returnUrl: input.returnUrl ?? undefined,
      };
    }

    if (process.env.EXTERNAL_AUTH_AUTO_PROVISION === "false") {
      return {
        status: "needs_link",
        code: "needs_link",
        message: "Provider identity is not linked.",
        returnUrl: input.returnUrl ?? undefined,
      };
    }

    const displayEmail = input.profile.emailVerified
      ? (input.profile.email ?? null)
      : null;
    const policy = createDefaultAccessPolicy(
      displayEmail ?? "",
      process.env,
      input.tenantId,
    );
    const created = await this.users.create({
      tenantId: input.tenantId,
      email: displayEmail,
      displayName: input.profile.displayName ?? input.profile.username ?? null,
      passwordHash: hashPassword(
        ExternalAccountPasswordSeed + randomBytes(16).toString("hex"),
      ),
      roles: policy.roles,
      permissions: policy.permissions,
    });
    if (created.isErr()) {
      throw new ConflictException(created.error.message);
    }
    const identity = await this.social.upsertIdentity(
      profileToIdentityInput(input.profile, input.tenantId, created.value.id),
    );
    if (identity.isErr()) {
      throw new ConflictException(identity.error.message);
    }
    await this.recordMethod(
      created.value.id,
      input.tenantId,
      input.profile.channel,
      identity.value.id,
    );
    await this.persistDiscordTokensIfConfigured(
      created.value.id,
      input.tenantId,
      identity.value.id,
      input.discordTokens,
    );
    return {
      status: "authenticated",
      session: this.createExternalSession(
        created.value,
        input.profile,
        identity.value.id,
      ),
      identity: toIdentityView(identity.value),
      returnUrl: input.returnUrl ?? undefined,
    };
  }

  private async linkProfileToUser(input: {
    tenantId: string;
    userId: string;
    profile: VerifiedExternalProfile;
    returnUrl?: string | null;
    discordTokens?: OAuth2Tokens;
  }): Promise<ExternalAuthLoginResult> {
    const existing = await this.social.findIdentity(
      input.profile.provider,
      input.profile.providerSubject,
      input.tenantId,
    );
    if (existing.isErr()) {
      throw new ConflictException(existing.error.message);
    }
    if (existing.value && existing.value.userId !== input.userId) {
      return {
        status: "conflict",
        code: "account_conflict",
        message: "Provider identity cannot be linked.",
        returnUrl: input.returnUrl ?? undefined,
      };
    }
    const identity = await this.social.upsertIdentity(
      profileToIdentityInput(input.profile, input.tenantId, input.userId),
    );
    if (identity.isErr()) {
      throw new ConflictException(identity.error.message);
    }
    await this.recordMethod(
      input.userId,
      input.tenantId,
      input.profile.channel,
      identity.value.id,
    );
    await this.persistDiscordTokensIfConfigured(
      input.userId,
      input.tenantId,
      identity.value.id,
      input.discordTokens,
    );
    return {
      status: "linked",
      identity: toIdentityView(identity.value),
      returnUrl: input.returnUrl ?? undefined,
    };
  }

  private createExternalSession(
    user: AuthUserRecord,
    profile: VerifiedExternalProfile,
    externalIdentityId: string,
  ): AuthSessionView {
    return this.createSessionWithClaims(user, {
      amr: [profile.provider === "telegram" ? "telegram" : "discord"],
      authProvider: profile.provider,
      authChannel: profile.channel,
      authTime: Math.floor(Date.now() / 1000),
      externalIdentityId,
    });
  }

  createSessionWithClaims(
    user: AuthUserRecord,
    claims: ExternalAuthSessionClaims,
    env: JwtSigningEnvironment = process.env,
  ): AuthSessionView {
    return this.auth.createSession(user, env, undefined, claims);
  }

  private async recordMethod(
    userId: string,
    tenantId: string,
    channel: ExternalAuthProviderChannel,
    externalIdentityId: string,
  ): Promise<void> {
    await this.social.upsertMethod({
      tenantId,
      userId,
      method: channel,
      amr: [channel.startsWith("telegram") ? "telegram" : "discord"],
      externalIdentityId,
      lastUsedAt: new Date(),
    });
  }

  private async consumeLinkTokenOrThrow(
    token: string,
    purpose: ExternalAuthIntent,
    tenantId: string,
  ) {
    const consumed = await this.social.consumeLinkToken(
      hashOpaqueToken(token),
      purpose,
      tenantId,
    );
    if (consumed.isErr()) {
      throw new UnauthorizedException(consumed.error.message);
    }
    if (!consumed.value) {
      throw new UnauthorizedException("link_token_expired");
    }
    return consumed.value;
  }

  private async requireActiveUser(
    userId: string,
    tenantId: string,
  ): Promise<AuthUserRecord> {
    const user = await this.users.findById(userId, tenantId);
    if (user.isErr() || !user.value || user.value.status !== "active") {
      throw new UnauthorizedException("Invalid external identity.");
    }
    await this.users.recordLogin(user.value.id, new Date(), tenantId);
    return user.value;
  }

  private async persistDiscordTokensIfConfigured(
    userId: string,
    tenantId: string,
    externalIdentityId: string,
    tokens?: OAuth2Tokens,
  ): Promise<void> {
    if (!tokens || process.env.DISCORD_TOKEN_STORAGE_ENABLED !== "true") {
      return;
    }
    const scopes = tokens.hasScopes()
      ? tokens.scopes()
      : (readList(process.env.DISCORD_OAUTH_SCOPES) ?? []);
    await this.social.persistProviderToken({
      tenantId,
      userId,
      externalIdentityId,
      provider: "discord",
      tokenKind: "access",
      plaintext: tokens.accessToken(),
      scopes,
      expiresAt: tokens.accessTokenExpiresAt(),
    });
    if (tokens.hasRefreshToken()) {
      await this.social.persistProviderToken({
        tenantId,
        userId,
        externalIdentityId,
        provider: "discord",
        tokenKind: "refresh",
        plaintext: tokens.refreshToken(),
        scopes,
        expiresAt: null,
      });
    }
  }
}

export function verifyTelegramWebLoginPayload(
  payload: Record<string, string | number | boolean | null | undefined>,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifiedExternalProfile {
  const hash = String(payload.hash ?? "");
  if (!hash) {
    throw new UnauthorizedException("invalid_signature");
  }
  const dataCheckString = Object.entries(payload)
    .filter(
      ([key, value]) => key !== "hash" && value !== undefined && value !== null,
    )
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort((left, right) => left.localeCompare(right))
    .join("\n");
  const secret = createHash("sha256").update(botToken, "utf8").digest();
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");
  const provided = Buffer.from(hash, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (
    provided.length !== expectedBuffer.length ||
    !timingSafeEqual(provided, expectedBuffer)
  ) {
    throw new UnauthorizedException("invalid_signature");
  }
  const authDate = Number(payload.auth_date);
  if (
    !Number.isFinite(authDate) ||
    authDate <= 0 ||
    nowSeconds - authDate >
      readPositiveInt(
        process.env.TELEGRAM_WEB_LOGIN_MAX_AGE_SECONDS,
        DefaultTelegramMaxAgeSeconds,
      )
  ) {
    throw new UnauthorizedException("invalid_signature");
  }
  const id = payload.id;
  if (id === undefined || id === null || String(id).trim().length === 0) {
    throw new BadRequestException("invalid_signature");
  }
  const displayName =
    [payload.first_name, payload.last_name]
      .filter(Boolean)
      .map(String)
      .join(" ") || null;
  return {
    provider: "telegram",
    channel: "telegram_web_login",
    providerSubject: String(id),
    displayName,
    username: payload.username ? String(payload.username) : null,
    avatarUrl: payload.photo_url ? String(payload.photo_url) : null,
    metadata: { source: "telegram_web_login" },
  };
}

function profileToIdentityInput(
  profile: VerifiedExternalProfile,
  tenantId: string,
  userId: string,
) {
  return {
    tenantId,
    userId,
    provider: profile.provider,
    providerSubject: profile.providerSubject,
    channel: profile.channel,
    profileMetadata: profile.metadata ?? {},
    email: profile.email ?? null,
    emailVerified: profile.emailVerified ?? null,
    locale: profile.locale ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    displayName: profile.displayName ?? null,
    username: profile.username ?? null,
    lastAuthenticatedAt: new Date(),
  };
}

function toIdentityView(
  identity: ExternalIdentityRecord,
): ExternalAuthIdentityView {
  return {
    id: identity.id,
    provider: identity.provider,
    providerSubject: identity.providerSubject,
    channel: identity.channel,
    email: identity.email,
    emailVerified: identity.emailVerified,
    displayName: identity.displayName,
    username: identity.username,
    avatarUrl: identity.avatarUrl,
    linkedAt: identity.linkedAt.toISOString(),
    lastAuthenticatedAt: identity.lastAuthenticatedAt?.toISOString() ?? null,
  };
}

function assertProviderEnabled(provider: ExternalAuthProvider): void {
  const value = process.env[`AUTH_${provider.toUpperCase()}_ENABLED`];
  if (value === "false") {
    throw new ForbiddenException("provider_disabled");
  }
}

function requireEnv(name: string, code: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new UnauthorizedException(code);
  }
  return value;
}

function assertReturnUrlAllowed(returnUrl?: string | null): void {
  if (!returnUrl) {
    return;
  }
  const allowed = readList(process.env.AUTH_ALLOWED_RETURN_URLS) ?? [];
  if (allowed.length === 0) {
    throw new BadRequestException("return_url_not_allowed");
  }
  if (!allowed.some((prefix) => returnUrl.startsWith(prefix))) {
    throw new BadRequestException("return_url_not_allowed");
  }
}

function createDiscordProvider(): Discord {
  return new Discord(
    requireEnv("DISCORD_CLIENT_ID", "provider_not_configured"),
    requireEnv("DISCORD_CLIENT_SECRET", "provider_not_configured"),
    requireEnv("DISCORD_REDIRECT_URI", "provider_not_configured"),
  );
}

async function fetchDiscordUser(accessToken: string): Promise<{
  id: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
  email?: string | null;
  verified?: boolean;
}> {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new UnauthorizedException("provider_not_configured");
  }
  return (await response.json()) as {
    id: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
    email?: string | null;
    verified?: boolean;
  };
}

function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readList(value: string | undefined): string[] | null {
  const items =
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? [];
  return items.length > 0 ? items : null;
}

function isRecentAuthTime(authTime: number | undefined): boolean {
  if (!authTime) {
    return false;
  }
  const maxAge = readPositiveInt(
    process.env.AUTH_STEP_UP_MAX_AGE_SECONDS,
    15 * 60,
  );
  return Math.floor(Date.now() / 1000) - authTime <= maxAge;
}
