import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal, AuthenticatedRequest } from "./access-control.types";
import {
  assertRequestTenantMatchesPrincipal,
  normalizeTenantId,
  readTenantIdHeader,
  resolveTenantId,
  DEFAULT_AUTH_TENANT_ID,
} from "./tenant-context";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-4222-8222-222222222222";
const principal: AuthenticatedPrincipal = {
  subject: "user-id",
  tenantId: TENANT_ID,
  roles: ["user"],
  permissions: ["profile:read"],
};

describe("tenant context helpers", () => {
  it("normalizes tenant ids and resolves the default tenant", () => {
    expect(normalizeTenantId(TENANT_ID.toUpperCase())).toBe(TENANT_ID);
    expect(normalizeTenantId("not-a-uuid")).toBeUndefined();
    expect(resolveTenantId(undefined)).toBe(DEFAULT_AUTH_TENANT_ID);
  });

  it("reads tenant headers and rejects tenant mismatch", () => {
    const request: AuthenticatedRequest = { headers: { "x-tenant-id": TENANT_ID } };
    expect(readTenantIdHeader(request)).toBe(TENANT_ID);
    assertRequestTenantMatchesPrincipal(request, principal);
    expect(request.tenantId).toBe(TENANT_ID);

    expect(() =>
      assertRequestTenantMatchesPrincipal(
        { headers: { "x-tenant-id": OTHER_TENANT_ID } },
        principal,
      ),
    ).toThrow(UnauthorizedException);
  });
});
