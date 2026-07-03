import { UnauthorizedException } from "@nestjs/common";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "./access-control.types";

export const DefaultAuthTenantId = "00000000-0000-0000-0000-000000000000";
export const TenantIdHeaders = ["x-tenant-id", "x-nrb-tenant-id"] as const;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function normalizeTenantId(
  value: string | null | undefined,
): string | undefined {
  if (value === null || value === undefined || value.trim() === "") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return uuidPattern.test(normalized) ? normalized : undefined;
}

export function resolveTenantId(value: string | null | undefined): string {
  return normalizeTenantId(value) ?? DefaultAuthTenantId;
}

export function readTenantIdHeader(
  request: AuthenticatedRequest,
): string | undefined {
  for (const header of TenantIdHeaders) {
    const directHeader =
      request.headers?.[header] ?? request.headers?.[header.toUpperCase()];
    const value = Array.isArray(directHeader) ? directHeader[0] : directHeader;
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }

    const getterValue =
      request.get?.(header) ?? request.get?.(header.toUpperCase());
    if (getterValue?.trim()) {
      return getterValue;
    }
  }

  return undefined;
}

export function assertRequestTenantMatchesPrincipal(
  request: AuthenticatedRequest,
  principal: AuthenticatedPrincipal,
): void {
  const requestedTenantId = readTenantIdHeader(request);
  const normalizedRequestedTenantId = requestedTenantId
    ? normalizeTenantId(requestedTenantId)
    : undefined;

  if (requestedTenantId && !normalizedRequestedTenantId) {
    throw new UnauthorizedException("Invalid tenant id.");
  }
  if (
    normalizedRequestedTenantId &&
    normalizedRequestedTenantId !== principal.tenantId
  ) {
    throw new UnauthorizedException("Tenant context mismatch.");
  }

  request.tenantId = principal.tenantId;
}
