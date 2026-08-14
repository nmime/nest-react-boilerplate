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
import { createAdminAbility, type AdminAuthorizedRequest } from '@app/backend-feature-admin-shared';
import {
  AuthUserRepositoryInjectToken,
  AuthUserRoleRepositoryInjectToken,
  isDemoPrincipal,
  PublicAuthMetadataKey,
  requireActiveSessionAccount,
  type AuthenticatedPrincipal,
  type AuthUserRepositoryPort,
  type AuthUserRoleRepositoryPort,
} from '@app/backend-feature-auth-shared';

/**
 * Resolves authorization from normalized PostgreSQL RBAC data for each admin
 * request. A signed token/session proves identity only; its role and
 * permission claims are deliberately replaced so revocations and role edits
 * take effect on the very next admin request.
 */
@Injectable()
export class AdminDatabaseAccessGuard implements CanActivate {
  constructor(
    private readonly metadata: Reflector,
    @Inject(AuthUserRepositoryInjectToken) private readonly users: AuthUserRepositoryPort,
    @Inject(AuthUserRoleRepositoryInjectToken) private readonly roles: AuthUserRoleRepositoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isExcludedRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AdminAuthorizedRequest>();
    const principal = request.user ?? request.auth;
    if (!principal) {
      throw new UnauthorizedException();
    }

    // Demo mode mints a principal with no account row; its grants already come from the shared
    // role matrix, so there is nothing for the database to add. See `isDemoPrincipal`.
    if (isDemoPrincipal(principal)) {
      request.user = principal;
      request.auth = principal;
      request.adminAbility = createAdminAbility(principal);
      return true;
    }

    requireActiveSessionAccount(principal, await this.users.findById(principal.subject, principal.tenantId));

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
    request.adminAbility = createAdminAbility(resolvedPrincipal);
    return true;
  }

  private isExcludedRoute(context: ExecutionContext): boolean {
    return [HealthRouteMetadataKey, PublicAuthMetadataKey].some(
      (key) =>
        this.metadata.getAllAndOverride<boolean | undefined>(key, [context.getHandler(), context.getClass()]) ?? false,
    );
  }
}
