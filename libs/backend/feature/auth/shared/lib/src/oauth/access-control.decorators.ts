import {
  createParamDecorator,
  type CustomDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "./access-control.types";

export const PublicAuthMetadataKey = "auth:public";
export const RequiredRolesMetadataKey = "auth:roles";
export const RequiredPermissionsMetadataKey = "auth:permissions";

export const Public = (): CustomDecorator<string> =>
  SetMetadata(PublicAuthMetadataKey, true);

export const RequireRoles = (...roles: string[]): CustomDecorator<string> =>
  SetMetadata(RequiredRolesMetadataKey, roles);

export const RequirePermissions = (
  ...permissions: string[]
): CustomDecorator<string> =>
  SetMetadata(RequiredPermissionsMetadataKey, permissions);

export const CurrentUser = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AuthenticatedPrincipal | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user ?? request.auth;
  },
);
