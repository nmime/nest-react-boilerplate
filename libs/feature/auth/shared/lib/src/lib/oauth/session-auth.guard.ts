import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PUBLIC_AUTH_METADATA_KEY } from "./access-control.decorators";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "./access-control.types";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.isPublicRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = getSessionPrincipal(request);
    if (!principal) {
      throw new UnauthorizedException("Authenticated session is required.");
    }

    request.user = principal;
    request.auth = principal;
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
}

export function setSessionPrincipal(
  request: AuthenticatedRequest,
  principal: AuthenticatedPrincipal,
): void {
  if (request.session) {
    request.session.user = principal;
  }

  request.user = principal;
  request.auth = principal;
}

export function clearSessionPrincipal(request: AuthenticatedRequest): void {
  if (request.session) {
    delete request.session.user;
  }
  delete request.user;
  delete request.auth;
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
    Array.isArray(principal.roles) &&
    principal.roles.every((role) => typeof role === "string") &&
    Array.isArray(principal.permissions) &&
    principal.permissions.every((permission) => typeof permission === "string")
  );
}
