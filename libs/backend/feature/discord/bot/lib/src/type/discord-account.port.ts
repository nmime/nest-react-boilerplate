import type { Locale } from '@app/backend-common-i18n';

export interface DiscordAccountLinkResult {
  authorizationUrl: string;
  expiresAt?: string;
}

export interface DiscordAccountStatusResult {
  linked: boolean;
  displayName?: string | null;
}

export interface DiscordCreateAccountLinkInput {
  userId: string;
  guildId?: string | null;
  tenantId?: string | null;
  locale: Locale;
  returnUrl?: string | null;
}

export interface DiscordAccountStatusInput {
  userId: string;
  tenantId?: string | null;
}

export interface DiscordAccountUnlinkInput {
  userId: string;
  guildId?: string | null;
  tenantId?: string | null;
}

export interface DiscordAccountUnlinkResult {
  unlinked: boolean;
}

/**
 * Application-facing view of the external auth feature the Discord account
 * flows depend on (authorization-request creation, identity listing, unlink).
 * It is deliberately structural so the concrete provider — bound by the host
 * app — can be the auth feature's `ExternalAuthService` (or an adapter over it)
 * without the Discord bot library taking a build dependency on the auth
 * feature. Resolved through {@link DiscordAccountExternalAuthInjectToken}.
 */
export interface DiscordExternalAuthPort {
  createDiscordAuthorizationRequest(input: {
    tenantId: string;
    intent: 'link';
    returnUrl?: string | null;
    principal: { subject: string; tenantId: string };
  }): { authorizationUrl: string; stateExpiresAt: string };
  listProviderIdentities(
    userId: string,
    tenantId: string,
  ): Promise<
    Array<{
      id?: string;
      provider: string;
      providerSubject: string;
      displayName: string | null;
      username: string | null;
    }>
  >;
  unlinkProviderIdentity?(
    identityId: string,
    principal: { subject: string; tenantId: string },
  ): Promise<{ unlinked: boolean }>;
}

/**
 * DI token for the optional {@link DiscordExternalAuthPort}. A Symbol token is
 * required because the port is a structural TypeScript interface with no
 * runtime representation to inject by type. When left unbound the account
 * service degrades gracefully (link falls back to a URL template/builder,
 * status/unlink report "not linked"/no-op).
 */
export const DiscordAccountExternalAuthInjectToken = Symbol('DiscordAccountExternalAuthInjectToken');

export abstract class DiscordAccountApplicationPort {
  abstract createLink(input: DiscordCreateAccountLinkInput): Promise<DiscordAccountLinkResult>;

  abstract status(input: DiscordAccountStatusInput): Promise<DiscordAccountStatusResult>;

  abstract unlink(input: DiscordAccountUnlinkInput): Promise<DiscordAccountUnlinkResult>;
}
