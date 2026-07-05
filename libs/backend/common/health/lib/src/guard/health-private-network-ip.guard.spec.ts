import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { RequestWithClientAddress } from "@app/backend-common-network";
import { HealthPrivateNetworkIpGuard } from "./health-private-network-ip.guard";

const contextForRequest = (
  request: RequestWithClientAddress,
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: <T>() => request as T,
    }),
  }) as unknown as ExecutionContext;

describe("HealthPrivateNetworkIpGuard", () => {
  const guard = new HealthPrivateNetworkIpGuard();
  const privateIp = [10, 0, 0, 1].join(".");
  const privateSocketIp = [192, 168, 1, 10].join(".");
  const publicIp = [8, 8, 8, 8].join(".");

  it("allows requests originating from a private network address", () => {
    expect(guard.canActivate(contextForRequest({ ip: privateIp }))).toBe(true);
  });

  it("resolves the client address from the socket when no explicit ip is set", () => {
    expect(
      guard.canActivate(
        contextForRequest({ socket: { remoteAddress: privateSocketIp } }),
      ),
    ).toBe(true);
  });

  it("denies requests originating from a public network address", () => {
    expect(guard.canActivate(contextForRequest({ ip: publicIp }))).toBe(false);
  });
});
