import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PublicAuthMetadataKey, DefaultAuthTenantId, isLanguage, isAuthenticatedTheme } from "@app/backend-feature-auth-shared";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "@app/backend-feature-auth-shared";
import {
  assertRequestTenantMatchesPrincipal,
  resolveTenantId,
} from "@app/backend-feature-auth-shared";

@Injectable()
export class BetterAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublicRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Try session via Better-Auth headers
    const cookie = this.getCookieHeader(request);
    const session = await this.getSessionFromCookie(cookie);
    if (session) {
      this.setPrincipal(request, session);
      return true;
    }

    // Fall back to Bearer token
    const principal = this.getPrincipalFromBearer(request);
    if (principal) {
      assertRequestTenantMatchesPrincipal(request, principal);
      request.user = principal;
      request.auth = principal;
      return true;
    }

    throw new UnauthorizedException("No valid session or bearer token found.");
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(PublicAuthMetadataKey, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private async getSessionFromCookie(cookie: string): Promise<AuthenticatedPrincipal | null> {
    if (!cookie) return null;
    try {
      const baseURL = this.getBaseUrl();
      // Better-Auth is configured at startup; use direct API call
      const res = await fetch(`${baseURL}/api/auth/get-tenant-session`, {
        method: "GET",
        headers: { Cookie: cookie },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Record<string, unknown>;
      const user = data?.user as Record<string, unknown> | undefined;
      if (!user?.id) return null;
      return {
        subject: String(user.id),
        tenantId: (user.tenantId as string) || resolveTenantId(DefaultAuthTenantId),
        email: user.email ? String(user.email) : undefined,
        displayName: user.name ? String(user.name) : (user.displayName ? String(user.displayName) : undefined),
        locale: typeof user.locale === "string" && isLanguage(user.locale) ? user.locale : undefined,
        theme: typeof user.theme === "string" && isAuthenticatedTheme(user.theme) ? user.theme : undefined,
        roles: Array.isArray(user.roles) ? (user.roles as string[]) : [],
        permissions: Array.isArray(user.permissions) ? (user.permissions as string[]) : [],
      };
    } catch {
      return null;
    }
  }

  private getPrincipalFromBearer(request: AuthenticatedRequest): AuthenticatedPrincipal | null {
    const authHeader = this.getAuthorizationHeader(request);
    if (!authHeader) return null;
    const token = this.extractBearerToken(authHeader);
    if (!token) return null;
    try {
      const parts = token.split(".");
      const payloadPart = parts[1];
      if (!payloadPart) return null;
      const decoded = JSON.parse(Buffer.from(payloadPart, "base64url").toString());
      if (!decoded.sub) return null;
      if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
      return {
        subject: String(decoded.sub),
        tenantId: (decoded.tenantId as string) || (decoded.tid as string) || resolveTenantId(DefaultAuthTenantId),
        email: decoded.email ? String(decoded.email) : undefined,
        displayName: decoded.name ? String(decoded.name) : undefined,
        locale: typeof decoded.locale === "string" ? decoded.locale : undefined,
        theme: typeof decoded.theme === "string" ? decoded.theme : undefined,
        roles: Array.isArray(decoded.roles) ? (decoded.roles as string[]) : [],
        permissions: Array.isArray(decoded.permissions) ? (decoded.permissions as string[]) : [],
        tokenId: decoded.jti ? String(decoded.jti) : undefined,
      };
    } catch {
      return null;
    }
  }

  private setPrincipal(request: AuthenticatedRequest, principal: AuthenticatedPrincipal): void {
    assertRequestTenantMatchesPrincipal(request, principal);
    request.tenantId = principal.tenantId;
    request.user = principal;
    request.auth = principal;
  }

  private getCookieHeader(request: AuthenticatedRequest): string {
    const h = request.headers as Record<string, string | string[] | undefined>;
    const cookie = h?.cookie ?? h?.Cookie;
    if (Array.isArray(cookie)) return cookie[0] || "";
    return (cookie as string) || "";
  }

  private getAuthorizationHeader(request: AuthenticatedRequest): string | undefined {
    const h = request.headers as Record<string, string | string[] | undefined>;
    const val = h?.authorization ?? h?.Authorization;
    if (Array.isArray(val)) return val[0];
    return val as string | undefined;
  }

  private extractBearerToken(authHeader: string): string | null {
    const parts = authHeader.trim().split(" ");
    if (parts.length !== 2 || !parts[0] || parts[0].toLowerCase() !== "bearer") return null;
    return parts[1] || null;
  }

  private getBaseUrl(): string {
    return process.env.BETTER_AUTH_URL ?? process.env.API_BASE_URL ?? "http://localhost:3003";
  }
}
