import { ExecutionContext, Injectable } from "@nestjs/common";
import {
  ADMIN_ALL_RESOURCE,
  ADMIN_MANAGE_ACTION,
  ADMIN_ROLE,
  adminPermissionToAbility,
  canAdmin,
  createAdminAbility,
} from "@app/backend/feature-admin-shared";
import {
  type AuthenticatedRequest,
  type PermissionEvaluationContext,
  type PermissionEvaluationResult,
  RbacGuard,
} from "@app/feature-auth-shared";

@Injectable()
export class AdminRbacGuard extends RbacGuard {
  protected requiresPermissionMetadata(context: ExecutionContext): boolean {
    return this.isAdminRoute(context);
  }

  protected evaluateDomainPermission({
    permission,
    principal,
    requiredRoles,
  }: PermissionEvaluationContext): PermissionEvaluationResult {
    const adminRule = adminPermissionToAbility(permission);
    if (adminRule) {
      const adminAbility = createAdminAbility(principal);

      return (
        requiredRoles.includes(ADMIN_ROLE) &&
        (canAdmin(adminAbility, adminRule.action, adminRule.resource) ||
          canAdmin(adminAbility, ADMIN_MANAGE_ACTION, ADMIN_ALL_RESOURCE))
      );
    }

    if (permission.startsWith("admin:")) {
      return false;
    }

    return undefined;
  }

  private isAdminRoute(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const requestPath = request.url ?? request.path ?? "";

    return (
      context.getClass().name.startsWith("Admin") ||
      requestPath === "/admin" ||
      requestPath.startsWith("/admin/")
    );
  }
}
