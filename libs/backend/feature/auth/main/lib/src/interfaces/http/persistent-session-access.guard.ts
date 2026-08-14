import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HealthRouteMetadataKey } from '@app/backend-common-health';
import {
  assertRequestTenantMatchesPrincipal,
  isDemoPrincipal,
  PublicAuthMetadataKey,
  readSessionPrincipal,
  requireActiveSessionAccount,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';
import {
  AuthRoleStoreInjectToken,
  AuthUserStoreInjectToken,
  type AuthRoleStore,
  type AuthUserStore,
} from '../../infrastructure';

/**
 * Authenticates a first-party request from the server-side session and then
 * reloads account status and effective RBAC from persistence. Session data is
 * identity evidence only; cached roles and permissions never authorize a
 * request, so disabling an account or changing a role takes effect immediately.
 */
@Injectable()
export class PersistentSessionAccessGuard implements CanActivate {
  constructor(
    private readonly metadata: Reflector,
    @Inject(AuthUserStoreInjectToken)
    private readonly users: AuthUserStore,
    @Inject(AuthRoleStoreInjectToken)
    private readonly roles: AuthRoleStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.hasMetadata(HealthRouteMetadataKey, context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = readSessionPrincipal(request);
    if (!principal) {
      if (this.hasMetadata(PublicAuthMetadataKey, context)) {
        return true;
      }
      throw new UnauthorizedException();
    }
    assertRequestTenantMatchesPrincipal(request, principal);

    // The demo principal has no account row to reload, and its grants already come from the same
    // role matrix the database resolves against. Recognition is by object identity, so a session
    // that merely looks like the demo user still takes the database path below.
    if (isDemoPrincipal(principal)) {
      request.user = principal;
      request.auth = principal;
      return true;
    }

    const account = requireActiveSessionAccount(
      principal,
      await this.users.findById(principal.subject, principal.tenantId),
    );

    const effectiveAccess = await this.roles.resolveEffectiveAccess(principal.subject, principal.tenantId);
    if (effectiveAccess.isErr()) {
      throw new InternalServerErrorException();
    }

    const resolvedPrincipal: AuthenticatedPrincipal = {
      ...principal,
      roles: effectiveAccess.value.roleKeys,
      permissions: effectiveAccess.value.permissionKeys,
      // Read from the account, not the cookie, for the same reason grants are: a claim confirmed
      // after the session was minted must not need a re-login to take effect.
      emailVerified: Boolean(account.emailVerifiedAt),
    };
    request.user = resolvedPrincipal;
    request.auth = resolvedPrincipal;
    return true;
  }

  private hasMetadata(key: string, context: ExecutionContext): boolean {
    return (
      this.metadata.getAllAndOverride<boolean | undefined>(key, [context.getHandler(), context.getClass()]) ?? false
    );
  }
}
