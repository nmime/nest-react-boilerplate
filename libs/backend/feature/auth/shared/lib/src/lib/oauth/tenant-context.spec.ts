import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "./access-control.types";
import {
  assertRequestTenantMatchesPrincipal,
  normalizeTenantId,
  readTenantIdHeader,
  resolveTenantId,
  DefaultAuthTenantId,
} from "./tenant-context";

const tenantIdFixture = "11111111-1111-4111-8111-111111111111";
const otherTenantIdFixture = "22222222-2222-4222-8222-222222222222";
const principal: AuthenticatedPrincipal = {
  subject: "user-id",
  tenantId: tenantIdFixture,
  roles: ["user"],
  permissions: ["profile:read"],
};

describe("tenant context helpers", () => {
  it("normalizes tenant ids and resolves the default tenant", () => {
    expect(normalizeTenantId(tenantIdFixture.toUpperCase())).toBe(
      tenantIdFixture,
    );
    expect(normalizeTenantId("not-a-uuid")).toBeUndefined();
    expect(resolveTenantId(undefined)).toBe(DefaultAuthTenantId);
  });

  it("reads tenant headers and rejects tenant mismatch", () => {
    const request: AuthenticatedRequest = {
      headers: { "x-tenant-id": tenantIdFixture },
    };
    expect(readTenantIdHeader(request)).toBe(tenantIdFixture);
    assertRequestTenantMatchesPrincipal(request, principal);
    expect(request.tenantId).toBe(tenantIdFixture);

    expect(() =>
      assertRequestTenantMatchesPrincipal(
        { headers: { "x-tenant-id": otherTenantIdFixture } },
        principal,
      ),
    ).toThrow(UnauthorizedException);
  });
});
