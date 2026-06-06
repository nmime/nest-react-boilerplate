import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  PUBLIC_AUTH_METADATA_KEY,
  REQUIRED_PERMISSIONS_METADATA_KEY,
  REQUIRED_ROLES_METADATA_KEY,
} from "./access-control.decorators";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "./access-control.types";

export interface PermissionEvaluationContext {
  permission: string;
  principal: AuthenticatedPrincipal;
  requiredRoles: readonly string[];
}

export type PermissionEvaluationResult = boolean | undefined;

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.isPublicRoute(context)) {
      return true;
    }

    const requiredRoles = this.getMetadata(
      REQUIRED_ROLES_METADATA_KEY,
      context,
    );
    const requiredPermissions = this.getMetadata(
      REQUIRED_PERMISSIONS_METADATA_KEY,
      context,
    );
    const principal = this.getPrincipal(context);

    if (
      this.requiresPermissionMetadata(context) &&
      requiredPermissions.length === 0
    ) {
      throw new ForbiddenException("Access permission metadata is missing.");
    }

    if (requiredRoles.length > 0 && !hasAnyRole(principal, requiredRoles)) {
      throw new ForbiddenException("Required role is missing.");
    }
    if (
      !this.hasAllPermissions(principal, requiredPermissions, requiredRoles)
    ) {
      throw new ForbiddenException("Required permission is missing.");
    }

    return true;
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_AUTH_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private getMetadata(key: string, context: ExecutionContext): string[] {
    return (
      this.reflector.getAllAndOverride<string[]>(key, [
        context.getHandler(),
        context.getClass(),
      ]) ?? []
    );
  }

  private getPrincipal(context: ExecutionContext): AuthenticatedPrincipal {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.user ?? request.auth;
    if (!principal) {
      throw new UnauthorizedException("Authenticated principal is missing.");
    }

    return principal;
  }

  protected requiresPermissionMetadata(context: ExecutionContext): boolean;
  protected requiresPermissionMetadata(): boolean {
    return false;
  }

  protected evaluateDomainPermission(
    context: PermissionEvaluationContext,
  ): PermissionEvaluationResult;
  protected evaluateDomainPermission(): PermissionEvaluationResult {
    return undefined;
  }

  private hasAllPermissions(
    principal: AuthenticatedPrincipal,
    permissions: string[],
    requiredRoles: string[],
  ): boolean {
    return permissions.every((permission) => {
      const domainResult = this.evaluateDomainPermission({
        permission,
        principal,
        requiredRoles,
      });

      return domainResult ?? principal.permissions.includes(permission);
    });
  }
}

function hasAnyRole(
  principal: AuthenticatedPrincipal,
  roles: string[],
): boolean {
  return roles.some((role) => principal.roles.includes(role));
}
