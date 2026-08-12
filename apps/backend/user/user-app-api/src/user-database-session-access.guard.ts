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
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
  AuthUserRepositoryInjectToken,
  AuthUserRoleRepositoryInjectToken,
  type AuthUserRepositoryPort,
  type AuthUserRoleRepositoryPort,
} from '@app/backend-feature-auth-shared';

/** Database-authoritative session authentication for the user API. */
@Injectable()
export class UserDatabaseSessionAccessGuard implements CanActivate {
  constructor(
    private readonly metadata: Reflector,
    @Inject(AuthUserRepositoryInjectToken) private readonly users: AuthUserRepositoryPort,
    @Inject(AuthUserRoleRepositoryInjectToken) private readonly roles: AuthUserRoleRepositoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isExcludedRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = readSessionPrincipal(request);
    if (!principal) {
      throw new UnauthorizedException();
    }
    assertRequestTenantMatchesPrincipal(request, principal);

    // Demo mode mints a principal with no account row; its grants already come from the shared
    // role matrix, so there is nothing for the database to add. See `isDemoPrincipal`.
    if (isDemoPrincipal(principal)) {
      request.user = principal;
      request.auth = principal;
      return true;
    }

    const user = await this.users.findById(principal.subject, principal.tenantId);
    if (user.isErr()) {
      throw new InternalServerErrorException();
    }
    if (!user.value || user.value.status !== 'active') {
      throw new UnauthorizedException();
    }

    const effectiveAccess = await this.roles.resolveEffectiveAccess(principal.subject, principal.tenantId);
    if (effectiveAccess.isErr()) {
      throw new InternalServerErrorException();
    }

    const resolvedPrincipal: AuthenticatedPrincipal = {
      ...principal,
      roles: effectiveAccess.value.roleKeys,
      permissions: effectiveAccess.value.permissionKeys,
    };
    request.user = resolvedPrincipal;
    request.auth = resolvedPrincipal;
    return true;
  }

  private isExcludedRoute(context: ExecutionContext): boolean {
    return [HealthRouteMetadataKey, PublicAuthMetadataKey].some(
      (key) =>
        this.metadata.getAllAndOverride<boolean | undefined>(key, [context.getHandler(), context.getClass()]) ?? false,
    );
  }
}
