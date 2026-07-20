import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { generateCodeVerifier, generateState, type OAuth2Tokens } from 'arctic';
import { parse as parseTmaInitData, validate as validateTmaInitData } from '@tma.js/init-data-node';
import {
  AuthProvider,
  AuthProviderChannel,
  ExternalAuthIntent,
  permissionsForRoles,
  resolveBootstrapRoleKeys,
  type AuthSessionView,
  type ExternalAuthIdentityView,
  type ExternalAuthProvider,
  type ExternalAuthProviderChannel,
  type LinkTokenResult,
} from '@app/backend-feature-auth-shared';
import { hashPassword, type JwtSigningEnvironment } from '../domain';
import { AuthService } from './auth.service';
import { parseTenantId } from './util/auth-error-adapter.util';
import {
  AuthUserStoreInjectToken,
  type AuthUserRecord,
  type AuthUserStore,
  SocialAuthStoreInjectToken,
  InMemorySocialAuthStore,
  type SocialAuthStore,
} from '../infrastructure';
import {
  DefaultDiscordStateTtlSeconds,
  DefaultLinkTokenTtlSeconds,
  DefaultMaxDiscordStateEntries,
  DefaultTelegramMaxAgeSeconds,
  ExternalAccountPasswordSeed,
} from './const/external-auth.const';
import type {
  DiscordAuthorizationRequestInput,
  DiscordAuthorizationRequestResult,
  DiscordCallbackInput,
  ExternalAuthLoginResult,
  ExternalAuthSessionClaims,
  TelegramBotLinkInput,
  TelegramOidcSessionInput,
  TelegramTmaInput,
} from './type/external-auth.type';
import type { StoredDiscordState, VerifiedExternalProfile } from './type/external-auth-internal.type';
import {
  assertProviderEnabled,
  hashOpaqueToken,
  isRecentAuthTime,
  readList,
  readPositiveInt,
  requireEnv,
} from './util/external-auth.util';
import { assertReturnUrlAllowed } from './util/return-url.util';
import { createDiscordProvider, fetchDiscordUser } from './factory/discord-provider.factory';
import { profileToIdentityInput, toIdentityView } from './mapper/external-auth.mapper';
import { LastAuthMethodUnlinkForbiddenException, StepUpRequiredException } from './external-auth.exception';

// External-auth I/O interfaces are decomposed into role-based sibling files;
// they are re-exported here so the application barrel stays stable.
export * from './type/external-auth.type';

@Injectable()
export class ExternalAuthService {
  // In-memory, single-instance store. Multi-instance deployments need a shared
  // store (e.g. Redis) keyed by the state hash so callbacks can hit any replica.
  private readonly discordStates = new Map<string, StoredDiscordState>();

  constructor(
    private readonly auth: AuthService,
    @Inject(AuthUserStoreInjectToken)
    private readonly users: AuthUserStore,
    @Optional()
    @Inject(SocialAuthStoreInjectToken)
    private readonly social: SocialAuthStore = new InMemorySocialAuthStore(),
  ) {}

  async telegramTma(input: TelegramTmaInput): Promise<ExternalAuthLoginResult> {
    assertProviderEnabled(AuthProvider.Telegram);
    const botToken = requireEnv('TELEGRAM_BOT_TOKEN', 'provider_not_configured');
    try {
      validateTmaInitData(input.initData, botToken, {
        expiresIn: readPositiveInt(process.env.TELEGRAM_TMA_MAX_AGE_SECONDS, DefaultTelegramMaxAgeSeconds),
      });
    } catch {
      throw new UnauthorizedException('invalid_signature');
    }
    const initData = parseTmaInitData(input.initData);
    if (!initData.user?.id) {
      throw new BadRequestException('invalid_signature');
    }
    const user = initData.user;
    const providerSubject = String(user.id);
    if (providerSubject !== input.betterAuthProviderSubject) {
      throw new UnauthorizedException('telegram_identity_mismatch');
    }
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
    return this.resolveVerifiedProfile({
      tenantId: parseTenantId(input.tenantId),
      intent: input.intent ?? ExternalAuthIntent.Login,
      linkToken: input.linkToken,
      returnUrl: input.returnUrl,
      principal: input.principal,
      profile: {
        provider: AuthProvider.Telegram,
        channel: AuthProviderChannel.TelegramTma,
        providerSubject,
        displayName,
        username: user.username ?? null,
        avatarUrl: user.photo_url ?? null,
        locale: user.language_code ?? null,
        metadata: {
          source: 'telegram_tma',
          startParam: initData.start_param ?? null,
        },
      },
    });
  }

  async telegramOidcSession(input: TelegramOidcSessionInput): Promise<ExternalAuthLoginResult> {
    assertProviderEnabled(AuthProvider.Telegram);
    return this.resolveVerifiedProfile({
      tenantId: parseTenantId(input.tenantId),
      intent: input.intent ?? ExternalAuthIntent.Login,
      linkToken: input.linkToken,
      returnUrl: input.returnUrl,
      principal: input.principal,
      profile: {
        provider: AuthProvider.Telegram,
        channel: AuthProviderChannel.TelegramOidc,
        providerSubject: input.profile.providerSubject,
        displayName: input.profile.displayName,
        avatarUrl: input.profile.avatarUrl,
        metadata: { source: 'telegram_oidc' },
      },
    });
  }

  async telegramBotLink(input: TelegramBotLinkInput): Promise<ExternalAuthLoginResult> {
    assertProviderEnabled(AuthProvider.Telegram);
    const tenantId = parseTenantId(input.tenantId);
    const consumed = await this.consumeLinkTokenOrThrow(input.linkToken, ExternalAuthIntent.Link, tenantId);
    if (!consumed.userId) {
      throw new UnauthorizedException('link_token_expired');
    }
    return this.linkProfileToUser({
      tenantId,
      userId: consumed.userId,
      profile: {
        provider: AuthProvider.Telegram,
        channel: AuthProviderChannel.TelegramBot,
        providerSubject: input.providerSubject,
        username: input.username,
        displayName: input.displayName,
        locale: input.locale,
        avatarUrl: input.avatarUrl,
        metadata: { source: 'telegram_bot' },
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
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + readPositiveInt(process.env.EXTERNAL_AUTH_LINK_TOKEN_TTL_SECONDS, DefaultLinkTokenTtlSeconds) * 1000,
    );
    const created = await this.social.createLinkToken({
      tenantId,
      userId: input.userId,
      provider: input.provider,
      purpose: input.intent ?? ExternalAuthIntent.Link,
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
      intent: input.intent ?? ExternalAuthIntent.Link,
    };
  }

  async listProviderIdentities(userId: string, tenantIdInput?: string | null): Promise<ExternalAuthIdentityView[]> {
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
      throw new StepUpRequiredException();
    }
    // Count only methods whose backing identity still exists. A prior unlink
    // deletes the ExternalIdentity but leaves its AuthMethod row behind; counting
    // those stale rows would let a user unlink past the last usable method and
    // lock themselves out, defeating the last-auth-method guard.
    const usableMethods = await this.countUsableMethods(principal.subject, tenantId);
    if (usableMethods <= 1) {
      throw new LastAuthMethodUnlinkForbiddenException();
    }
    // Delete first, scoped to the caller (identityId + subject + tenantId). Only
    // revoke provider tokens once the owner-scoped delete actually removed a row;
    // revoking by identityId alone would let a caller wipe another user's stored
    // provider tokens (cross-user IDOR).
    const deleted = await this.social.deleteIdentity(identityId, principal.subject, tenantId);
    if (deleted.isErr()) {
      throw new ConflictException(deleted.error.message);
    }
    if (deleted.value) {
      await this.social.revokeProviderTokens(identityId, tenantId);
    }
    return { unlinked: deleted.value };
  }

  private async countUsableMethods(userId: string, tenantId: string): Promise<number> {
    const [methods, identities] = await Promise.all([
      this.social.listMethods(userId, tenantId),
      this.social.listIdentities(userId, tenantId),
    ]);
    if (methods.isErr()) {
      throw new ConflictException(methods.error.message);
    }
    if (identities.isErr()) {
      throw new ConflictException(identities.error.message);
    }
    const liveIdentityIds = new Set(identities.value.map((identity) => identity.id));
    return methods.value.filter(
      (method) => method.externalIdentityId === null || liveIdentityIds.has(method.externalIdentityId),
    ).length;
  }

  createDiscordAuthorizationRequest(input: DiscordAuthorizationRequestInput): DiscordAuthorizationRequestResult {
    assertProviderEnabled(AuthProvider.Discord);
    const tenantId = parseTenantId(input.tenantId);
    assertReturnUrlAllowed(input.returnUrl);
    const provider = createDiscordProvider();
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const intent = input.intent ?? ExternalAuthIntent.Login;
    const expiresAt = new Date(
      Date.now() + readPositiveInt(process.env.DISCORD_OAUTH_STATE_TTL_SECONDS, DefaultDiscordStateTtlSeconds) * 1000,
    );
    this.pruneDiscordStates();
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
    const scopes = readList(process.env.DISCORD_SCOPES) ?? ['identify', 'email'];
    const authorizationUrl = provider.createAuthorizationURL(state, codeVerifier, scopes);
    return {
      authorizationUrl: authorizationUrl.toString(),
      stateExpiresAt: expiresAt.toISOString(),
    };
  }

  private pruneDiscordStates(now: Date = new Date()): void {
    for (const [stateHash, state] of this.discordStates) {
      if (state.expiresAt <= now) {
        this.discordStates.delete(stateHash);
      }
    }
    const maxEntries = readPositiveInt(process.env.DISCORD_OAUTH_STATE_MAX_ENTRIES, DefaultMaxDiscordStateEntries);
    while (this.discordStates.size >= maxEntries) {
      const oldest = this.discordStates.keys().next().value;
      /* v8 ignore next -- Map#keys() cannot be empty while size is positive; kept as a defensive guard. */
      if (oldest === undefined) {
        break;
      }
      this.discordStates.delete(oldest);
    }
  }

  async discordCallback(input: DiscordCallbackInput): Promise<ExternalAuthLoginResult> {
    assertProviderEnabled(AuthProvider.Discord);
    if (!input.code || !input.state) {
      throw new UnauthorizedException('invalid_state');
    }
    const stateHash = hashOpaqueToken(input.state);
    const stored = this.discordStates.get(stateHash);
    this.discordStates.delete(stateHash);
    if (!stored || stored.expiresAt <= new Date()) {
      throw new UnauthorizedException('invalid_state');
    }
    const tokens = await createDiscordProvider().validateAuthorizationCode(input.code, stored.codeVerifier);
    const discordUser = await fetchDiscordUser(tokens.accessToken());
    const profile: VerifiedExternalProfile = {
      provider: AuthProvider.Discord,
      channel: AuthProviderChannel.DiscordOauth,
      providerSubject: discordUser.id,
      email: discordUser.verified ? discordUser.email : null,
      emailVerified: discordUser.verified ?? false,
      displayName: discordUser.global_name ?? discordUser.username ?? null,
      username: discordUser.username ?? null,
      avatarUrl: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null,
      metadata: { source: 'discord_oauth' },
    };
    const result = await this.resolveVerifiedProfile({
      tenantId: stored.tenantId,
      intent: stored.intent,
      linkToken: stored.linkToken,
      returnUrl: stored.returnUrl,
      principal: input.principal ?? (stored.userId ? { subject: stored.userId, tenantId: stored.tenantId } : null),
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
    if (input.intent === ExternalAuthIntent.Link) {
      const userId =
        input.principal?.subject ??
        (input.linkToken
          ? (await this.consumeLinkTokenOrThrow(input.linkToken, ExternalAuthIntent.Link, input.tenantId)).userId
          : null);
      if (!userId) {
        throw new UnauthorizedException('link_token_expired');
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
      const user = await this.requireActiveUser(existing.value.userId, input.tenantId);
      const identity = await this.social.upsertIdentity({
        ...profileToIdentityInput(input.profile, input.tenantId, user.id),
        lastAuthenticatedAt: new Date(),
      });
      if (identity.isErr()) {
        throw new ConflictException(identity.error.message);
      }
      await this.recordMethod(user.id, input.tenantId, input.profile.channel, identity.value.id);
      await this.persistDiscordTokensIfConfigured(user.id, input.tenantId, identity.value.id, input.discordTokens);
      await this.syncAvatarToUser(user.id, input.tenantId, input.profile.avatarUrl);
      return {
        status: 'authenticated',
        session: this.createExternalSession(user, input.profile, identity.value.id),
        identity: toIdentityView(identity.value),
        returnUrl: input.returnUrl ?? undefined,
      };
    }

    if (process.env.EXTERNAL_AUTH_AUTO_PROVISION_ENABLED !== 'true') {
      return {
        status: 'needs_link',
        code: 'needs_link',
        message: 'Provider identity is not linked.',
        returnUrl: input.returnUrl ?? undefined,
      };
    }

    const displayEmail = input.profile.emailVerified ? (input.profile.email ?? null) : null;
    // Provision the account with bootstrap ROLES (matrix-derived arrays up
    // front), then let the resolver refresh the denormalized cache from the
    // normalized RBAC tables via the shared AuthService helper.
    const roleKeys = resolveBootstrapRoleKeys(displayEmail ?? '', process.env, input.tenantId);
    const created = await this.users.create({
      tenantId: input.tenantId,
      email: displayEmail,
      displayName: input.profile.displayName ?? input.profile.username ?? null,
      passwordHash: hashPassword(ExternalAccountPasswordSeed + randomBytes(16).toString('hex')),
      roles: roleKeys,
      permissions: permissionsForRoles(roleKeys),
    });
    if (created.isErr()) {
      throw new ConflictException(created.error.message);
    }
    const bootstrapUser = await this.auth.bootstrapUserAccess(created.value, roleKeys);
    const identity = await this.social.upsertIdentity(
      profileToIdentityInput(input.profile, input.tenantId, bootstrapUser.id),
    );
    if (identity.isErr()) {
      throw new ConflictException(identity.error.message);
    }
    await this.recordMethod(bootstrapUser.id, input.tenantId, input.profile.channel, identity.value.id);
    await this.persistDiscordTokensIfConfigured(
      bootstrapUser.id,
      input.tenantId,
      identity.value.id,
      input.discordTokens,
    );
    await this.syncAvatarToUser(bootstrapUser.id, input.tenantId, input.profile.avatarUrl);
    return {
      status: 'authenticated',
      session: this.createExternalSession(bootstrapUser, input.profile, identity.value.id),
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
        status: 'conflict',
        code: 'account_conflict',
        message: 'Provider identity cannot be linked.',
        returnUrl: input.returnUrl ?? undefined,
      };
    }
    const identity = await this.social.upsertIdentity(
      profileToIdentityInput(input.profile, input.tenantId, input.userId),
    );
    if (identity.isErr()) {
      throw new ConflictException(identity.error.message);
    }
    await this.recordMethod(input.userId, input.tenantId, input.profile.channel, identity.value.id);
    await this.persistDiscordTokensIfConfigured(input.userId, input.tenantId, identity.value.id, input.discordTokens);
    return {
      status: 'linked',
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
      amr: [profile.provider === AuthProvider.Telegram ? 'telegram' : 'discord'],
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
      amr: [channel.startsWith(AuthProvider.Telegram) ? 'telegram' : 'discord'],
      externalIdentityId,
      lastUsedAt: new Date(),
    });
  }

  private async consumeLinkTokenOrThrow(token: string, purpose: ExternalAuthIntent, tenantId: string) {
    const consumed = await this.social.consumeLinkToken(hashOpaqueToken(token), purpose, tenantId);
    if (consumed.isErr()) {
      throw new UnauthorizedException(consumed.error.message);
    }
    if (!consumed.value) {
      throw new UnauthorizedException('link_token_expired');
    }
    return consumed.value;
  }

  private async requireActiveUser(userId: string, tenantId: string): Promise<AuthUserRecord> {
    const user = await this.users.findById(userId, tenantId);
    if (user.isErr() || !user.value || user.value.status !== 'active') {
      throw new UnauthorizedException('Invalid external identity.');
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
    if (!tokens || process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED !== 'true') {
      return;
    }
    const scopes = tokens.hasScopes() ? tokens.scopes() : (readList(process.env.DISCORD_SCOPES) ?? []);
    await this.persistProviderTokenOrThrow({
      tenantId,
      userId,
      externalIdentityId,
      provider: AuthProvider.Discord,
      tokenKind: 'access',
      plaintext: tokens.accessToken(),
      scopes,
      expiresAt: tokens.accessTokenExpiresAt(),
    });
    if (tokens.hasRefreshToken()) {
      await this.persistProviderTokenOrThrow({
        tenantId,
        userId,
        externalIdentityId,
        provider: AuthProvider.Discord,
        tokenKind: 'refresh',
        plaintext: tokens.refreshToken(),
        scopes,
        expiresAt: null,
      });
    }
  }

  private async persistProviderTokenOrThrow(
    input: Parameters<SocialAuthStore['persistProviderToken']>[0],
  ): Promise<void> {
    const persisted = await this.social.persistProviderToken(input);
    if (persisted.isErr() || !persisted.value) {
      throw new ConflictException('Provider token storage is unavailable.');
    }
  }

  /**
   * Sync provider avatar to the canonical user profile.
   * Respects user-intent rules: never overrides manual or deleted status.
   */
  private async syncAvatarToUser(
    userId: string,
    tenantId: string,
    providerAvatarUrl: string | null | undefined,
  ): Promise<void> {
    if (!providerAvatarUrl) {
      // No provider avatar — do not clear existing (user may have manual)
      return;
    }
    try {
      // Use a simple content-addressable hash for change detection.
      const { createHash } = await import('node:crypto');
      const hash = createHash('sha256').update(providerAvatarUrl).digest('hex');
      await this.users.syncProviderAvatar(userId, { url: providerAvatarUrl, hash }, tenantId);
    } catch {
      // Non-fatal: avatar sync failure should not block auth flow.
    }
  }
}
