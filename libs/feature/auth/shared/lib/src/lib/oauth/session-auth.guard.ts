import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PUBLIC_AUTH_METADATA_KEY } from "./access-control.decorators";
import { validateBearerAuthorization } from "./bearer-auth.guard";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "./access-control.types";
import {
  assertRequestTenantMatchesPrincipal,
  normalizeTenantId,
} from "./tenant-context";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.isPublicRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal =
      getSessionPrincipal(request) ??
      validateBearerAuthorization(
        readAuthorizationHeader(request),
        process.env,
      );

    assertRequestTenantMatchesPrincipal(request, principal);
    request.user = principal;
    request.auth = principal;
    return request.user === principal && request.auth === principal;
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_AUTH_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }
}

export function setSessionPrincipal(
  request: AuthenticatedRequest,
  principal: AuthenticatedPrincipal,
): void {
  if (request.session) {
    request.session.user = principal;
  }

  request.tenantId = principal.tenantId;
  request.user = principal;
  request.auth = principal;
}

export function clearSessionPrincipal(request: AuthenticatedRequest): void {
  if (request.session) {
    delete request.session.user;
  }
  delete request.tenantId;
  delete request.user;
  delete request.auth;
}

function readAuthorizationHeader(
  request: AuthenticatedRequest,
): string | undefined {
  const directHeader =
    request.headers?.authorization ?? request.headers?.Authorization;
  if (Array.isArray(directHeader)) {
    return directHeader[0];
  }
  if (typeof directHeader === "string") {
    return directHeader;
  }

  return request.get?.("authorization") ?? request.get?.("Authorization");
}

function getSessionPrincipal(
  request: AuthenticatedRequest,
): AuthenticatedPrincipal | undefined {
  const principal = request.session?.user;
  return isAuthenticatedPrincipal(principal) ? principal : undefined;
}

function isAuthenticatedPrincipal(
  value: unknown,
): value is AuthenticatedPrincipal {
  if (!value || typeof value !== "object") {
    return false;
  }

  const principal = value as Partial<AuthenticatedPrincipal>;
  return (
    typeof principal.subject === "string" &&
    principal.subject.length > 0 &&
    typeof principal.tenantId === "string" &&
    normalizeTenantId(principal.tenantId) === principal.tenantId &&
    Array.isArray(principal.roles) &&
    principal.roles.every((role) => typeof role === "string") &&
    Array.isArray(principal.permissions) &&
    principal.permissions.every((permission) => typeof permission === "string")
  );
}
