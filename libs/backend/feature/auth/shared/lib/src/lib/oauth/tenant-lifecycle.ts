import type { AuthenticatedRequest } from "./access-control.types";
import {
  DEFAULT_AUTH_TENANT_ID,
  normalizeTenantId,
  readTenantIdHeader,
  resolveTenantId,
} from "./tenant-context";

export const TENANT_DOMAIN_HEADERS = [
  "x-tenant-domain",
  "x-nrb-tenant-domain",
] as const;

export const tenantRoles = ["owner", "admin", "member", "billing"] as const;
export type TenantRole = (typeof tenantRoles)[number];

export const tenantStatuses = ["active", "suspended", "deleted"] as const;
export type TenantStatus = (typeof tenantStatuses)[number];

export const tenantInvitationStatuses = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;
export type TenantInvitationStatus = (typeof tenantInvitationStatuses)[number];

export interface TenantView {
  id: string;
  slug: string;
  name: string;
  primaryDomain?: string;
  status: TenantStatus;
}

export interface TenantMembershipView {
  id: string;
  tenantId: string;
  userId: string;
  roles: TenantRole[];
  isDefault: boolean;
}

export interface TenantInvitationView {
  id: string;
  tenantId: string;
  email: string;
  roles: TenantRole[];
  status: TenantInvitationStatus;
  invitedByUserId?: string;
  expiresAt: string;
}

export interface TenantRequestContext {
  tenantId: string;
  tenantDomain?: string;
  source: "header" | "host" | "default";
}

const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const HOST_PORT_PATTERN = /:\d+$/u;

export function normalizeTenantSlug(
  value: string | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return TENANT_SLUG_PATTERN.test(normalized) ? normalized : undefined;
}

export function normalizeTenantDomain(
  value: string | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace(HOST_PORT_PATTERN, "");
  if (
    normalized.length > 253 ||
    normalized.includes("..") ||
    normalized.split(".").some((label) => !normalizeTenantSlug(label))
  ) {
    return undefined;
  }

  return normalized;
}

export function normalizeTenantRoles(values: readonly string[]): TenantRole[] {
  const roles = values
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is TenantRole =>
      tenantRoles.includes(value as TenantRole),
    );
  return roles.length > 0 ? [...new Set(roles)] : ["member"];
}

export function readTenantDomainHeader(
  request: AuthenticatedRequest,
): string | undefined {
  for (const header of TENANT_DOMAIN_HEADERS) {
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

export function resolveTenantRequestContext(
  request: AuthenticatedRequest,
): TenantRequestContext {
  const headerTenantId = readTenantIdHeader(request);
  const normalizedTenantId = normalizeTenantId(headerTenantId);
  if (normalizedTenantId) {
    return { tenantId: normalizedTenantId, source: "header" };
  }

  const tenantDomain =
    normalizeTenantDomain(readTenantDomainHeader(request)) ??
    normalizeTenantDomain(
      firstHeaderValue(request.headers?.host ?? request.headers?.Host),
    );

  if (tenantDomain) {
    return {
      tenantId: resolveTenantId(undefined),
      tenantDomain,
      source: "host",
    };
  }

  return { tenantId: DEFAULT_AUTH_TENANT_ID, source: "default" };
}

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
