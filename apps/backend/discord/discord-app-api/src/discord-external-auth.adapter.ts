import { Injectable } from '@nestjs/common';
import { ExternalAuthService } from '@app/backend-feature-auth-main';
import { ExternalAuthIntent } from '@app/backend-feature-auth-shared';
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

  createDiscordAuthorizationRequest(input: {
    tenantId: string;
    intent: 'link';
    returnUrl?: string | null;
    principal: { subject: string; tenantId: string };
  }): { authorizationUrl: string; stateExpiresAt: string } {
    return this.externalAuth.createDiscordAuthorizationRequest({
      tenantId: input.tenantId,
      intent: ExternalAuthIntent.Link,
      returnUrl: input.returnUrl,
      principal: input.principal,
    });
  }

  listProviderIdentities(userId: string, tenantId: string) {
    return this.externalAuth.listProviderIdentities(userId, tenantId);
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
      subject: principal.subject,
      tenantId: principal.tenantId,
      authTime: Math.floor(Date.now() / 1000),
    });
  }
}
