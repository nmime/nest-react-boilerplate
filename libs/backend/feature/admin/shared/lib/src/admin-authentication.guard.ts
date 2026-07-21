import { type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HealthRouteMetadataKey } from '@app/backend-common-health';
import { SessionAuthGuard } from '@app/backend-feature-auth-shared';

/**
 * Authenticates every route composed into the admin API. Authorization stays
 * on the owning feature controller through AdminRbacGuard and its explicit
 * role/permission metadata.
 */
@Injectable()
export class AdminAuthenticationGuard extends SessionAuthGuard {
  constructor(private readonly metadata: Reflector) {
    super(metadata);
  }

  override canActivate(context: ExecutionContext): boolean {
    if (this.isHealthRoute(context)) {
      return true;
    }

    return super.canActivate(context);
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
