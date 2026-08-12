import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PublicAuthMetadataKey } from './access-control.decorators';
import type { AuthenticatedPrincipal, AuthenticatedRequest } from './access-control.types';
import { resolveDemoPrincipal, type DemoAccessEnvironment } from './demo-access';
import { assertRequestTenantMatchesPrincipal, normalizeTenantId } from './tenant-context';

/* v8 ignore start -- Nest @Injectable() emits a decorator-helper branch that is unreachable for a class-only decorator. */
@Injectable()
/* v8 ignore stop */
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector = new Reflector(),
    private readonly env: DemoAccessEnvironment = process.env,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.isPublicRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = readSessionPrincipal(request, this.env);
    if (!principal) {
      throw new UnauthorizedException();
    }

    assertRequestTenantMatchesPrincipal(request, principal);
    const resolved = request.user ?? request.auth;
    const requestPrincipal =
      resolved?.subject === principal.subject && resolved.tenantId === principal.tenantId ? resolved : principal;
    request.user = requestPrincipal;
    request.auth = requestPrincipal;
    return request.user === requestPrincipal && request.auth === requestPrincipal;
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean | undefined>(PublicAuthMetadataKey, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }
}

export function setSessionPrincipal(request: AuthenticatedRequest, principal: AuthenticatedPrincipal): void {
  if (request.session) {
    // A server-side session proves identity and authentication context only.
    // Authorization guards replace these empty access arrays from normalized
    // RBAC tables on every protected request.
    request.session.user = {
      ...principal,
      roles: [],
      permissions: [],
    };
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

/**
 * The one place every access guard turns a request into a principal, which makes it the one
 * place demo mode has to change. A real session always wins; the synthetic demo principal only
 * fills the gap where the request would otherwise be rejected as unauthenticated.
 */
export function readSessionPrincipal(
  request: AuthenticatedRequest,
  env: DemoAccessEnvironment = process.env,
): AuthenticatedPrincipal | undefined {
  const principal = request.session?.user;
  return isAuthenticatedPrincipal(principal) ? principal : resolveDemoPrincipal(env);
}

function isAuthenticatedPrincipal(value: unknown): value is AuthenticatedPrincipal {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const principal = value as Partial<AuthenticatedPrincipal>;
  return (
    typeof principal.subject === 'string' &&
    principal.subject.length > 0 &&
    typeof principal.tenantId === 'string' &&
    normalizeTenantId(principal.tenantId) === principal.tenantId &&
    Array.isArray(principal.roles) &&
    principal.roles.every((role) => typeof role === 'string') &&
    Array.isArray(principal.permissions) &&
    principal.permissions.every((permission) => typeof permission === 'string')
  );
}
