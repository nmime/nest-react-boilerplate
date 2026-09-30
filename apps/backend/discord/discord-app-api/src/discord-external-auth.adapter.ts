import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ExternalAuthService } from '@app/backend-feature-auth-main';
import { AuthProvider, ExternalAuthIntent } from '@app/backend-feature-auth-shared';
import type { DiscordExternalAuthPort } from '@app/backend-feature-discord-bot';

/**
 * Binds the Discord bot's external-auth port to the auth feature's
 * {@link ExternalAuthService} via DI. The discord-app-api imports the auth
 * feature in-process (see `DiscordAppApiModule`), so this delegates directly
 * rather than calling the auth API over HTTP.
 */
/* v8 ignore start -- Nest @Injectable() emits a decorator-helper branch that is unreachable for a class-only decorator. */
@Injectable()
/* v8 ignore stop */
export class DiscordExternalAuthAdapter implements DiscordExternalAuthPort {
  constructor(private readonly externalAuth: ExternalAuthService) {}

  async createDiscordAuthorizationRequest(input: {
    tenantId: string;
    intent: 'link';
    returnUrl?: string | null;
    principal: { subject: string; tenantId: string };
  }): Promise<{ authorizationUrl: string; stateExpiresAt: string }> {
    const principal = await this.requirePrincipal(input.principal.subject, input.tenantId);
    if (input.principal.tenantId !== input.tenantId) {
      throw new UnauthorizedException('discord_tenant_mismatch');
    }
    return this.externalAuth.createDiscordAuthorizationRequest({
      intent: ExternalAuthIntent.Link,
      returnUrl: input.returnUrl,
      principal,
      binding: { kind: 'discord-interaction', providerSubject: input.principal.subject },
    });
  }

  async listProviderIdentities(userId: string, tenantId: string) {
    const principal = await this.externalAuth.resolveProviderPrincipal(AuthProvider.Discord, userId, tenantId);
    return principal ? this.externalAuth.listProviderIdentities(principal.subject, principal.tenantId) : [];
  }

  async unlinkProviderIdentity(
    identityId: string,
    principal: { subject: string; tenantId: string },
  ): Promise<{ unlinked: boolean }> {
    // A Discord interaction is Ed25519-verified per request, so the unlink
    // confirm click is itself a fresh, trusted proof of the acting user. Supply
    // that moment as the step-up `authTime` the auth feature requires before
    // unlinking — the bot channel has no long-lived session to reuse.
    return this.externalAuth.unlinkProviderIdentity(identityId, {
      ...(await this.requirePrincipal(principal.subject, principal.tenantId)),
      authTime: Math.floor(Date.now() / 1000),
    });
  }

  private async requirePrincipal(providerSubject: string, tenantId: string) {
    const principal = await this.externalAuth.resolveProviderPrincipal(AuthProvider.Discord, providerSubject, tenantId);
    if (!principal) {
      throw new UnauthorizedException('discord_account_not_linked');
    }
    return principal;
  }
}
