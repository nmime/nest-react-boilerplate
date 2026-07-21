import { ExecutionContext, Injectable } from '@nestjs/common';
import { canAdmin, createAdminAbility } from './ability';
import { AdminAllResource, AdminManageAction, AdminRole, adminPermissionToAbility } from './permissions';
import {
  type AuthenticatedRequest,
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
    principal,
    requiredRoles,
  }: PermissionEvaluationContext): PermissionEvaluationResult {
    const adminRule = adminPermissionToAbility(permission);
    if (adminRule) {
      const adminAbility = createAdminAbility(principal);

      return (
        requiredRoles.includes(AdminRole) &&
        (canAdmin(adminAbility, adminRule.action, adminRule.resource) ||
          canAdmin(adminAbility, AdminManageAction, AdminAllResource))
      );
    }

    if (permission.startsWith('admin:')) {
      return false;
    }

    return undefined;
  }

  private isAdminRoute(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const requestPath = request.url ?? request.path ?? '';

    return context.getClass().name.startsWith('Admin') || requestPath === '/admin' || requestPath.startsWith('/admin/');
  }
}
