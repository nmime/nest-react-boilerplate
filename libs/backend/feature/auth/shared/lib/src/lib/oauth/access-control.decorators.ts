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

export const PUBLIC_AUTH_METADATA_KEY = "auth:public";
export const REQUIRED_ROLES_METADATA_KEY = "auth:roles";
export const REQUIRED_PERMISSIONS_METADATA_KEY = "auth:permissions";

export const Public = (): CustomDecorator<string> =>
  SetMetadata(PUBLIC_AUTH_METADATA_KEY, true);

export const RequireRoles = (...roles: string[]): CustomDecorator<string> =>
  SetMetadata(REQUIRED_ROLES_METADATA_KEY, roles);

export const RequirePermissions = (
  ...permissions: string[]
): CustomDecorator<string> =>
  SetMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AuthenticatedPrincipal | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user ?? request.auth;
  },
);
