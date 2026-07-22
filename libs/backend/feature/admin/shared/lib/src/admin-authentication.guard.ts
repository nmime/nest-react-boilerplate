import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HealthRouteMetadataKey } from '@app/backend-common-health';
import {
  assertRequestTenantMatchesPrincipal,
  type AuthenticatedRequest,
  readSessionPrincipal,
} from '@app/backend-feature-auth-shared';

/**
 * Authenticates the browser-admin API exclusively through its HttpOnly cookie
 * session. Bearer credentials are deliberately ignored at this boundary.
 * Authorization stays on the owning controller through AdminRbacGuard.
 */
@Injectable()
export class AdminAuthenticationGuard implements CanActivate {
  constructor(private readonly metadata: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.isHealthRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = readSessionPrincipal(request);
    if (!principal) {
      throw new UnauthorizedException();
    }

    assertRequestTenantMatchesPrincipal(request, principal);
    request.user = principal;
    request.auth = principal;
    return true;
  }

  private isHealthRoute(context: ExecutionContext): boolean {
    return (
      this.metadata.getAllAndOverride<boolean | undefined>(HealthRouteMetadataKey, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }
}
