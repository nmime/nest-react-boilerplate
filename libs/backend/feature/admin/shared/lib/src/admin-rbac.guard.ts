import { ExecutionContext, Injectable } from '@nestjs/common';
import { canAdmin, type AdminAuthorizedRequest } from './ability';
import { AdminAllResource, AdminManageAction, adminPermissionToAbility } from './permissions';
import {
  type PermissionEvaluationContext,
  type PermissionEvaluationResult,
  RbacGuard,
} from '@app/backend-feature-auth-shared';

@Injectable()
export class AdminRbacGuard extends RbacGuard {
  protected override requiresPermissionMetadata(context: ExecutionContext): boolean {
    return this.isAdminRoute(context);
  }

  protected override evaluateDomainPermission({
    permission,
    request,
  }: PermissionEvaluationContext): PermissionEvaluationResult {
    const adminRule = adminPermissionToAbility(permission);
    if (adminRule) {
      const adminAbility = (request as AdminAuthorizedRequest).adminAbility;
      if (!adminAbility) {
        return false;
      }

      return (
        canAdmin(adminAbility, adminRule.action, adminRule.resource) ||
        canAdmin(adminAbility, AdminManageAction, AdminAllResource)
      );
    }

    // This guard is an admin-domain boundary. Never let an unmapped generic or
    // misspelled permission fall through to string-based RBAC on an admin route.
    return false;
  }

  private isAdminRoute(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminAuthorizedRequest>();
    const requestPath = request.url ?? request.path ?? '';

    return context.getClass().name.startsWith('Admin') || requestPath === '/admin' || requestPath.startsWith('/admin/');
  }
}
