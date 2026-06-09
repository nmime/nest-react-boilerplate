import { describe, expect, it } from "vitest";
import {
  buildIpAllowList,
  getClientIp,
  isIpInAllowList,
  isPrivateNetworkIp,
  isRequestFromPrivateNetwork,
} from "./index";

/* eslint-disable sonarjs/no-hardcoded-ip -- These addresses are deterministic fixtures for CIDR behavior. */
describe("network helpers", () => {
  it("detects private IPv4 ranges", () => {
    expect(isPrivateNetworkIp("10.1.2.3")).toBe(true);
    expect(isPrivateNetworkIp("172.16.0.1")).toBe(true);
    expect(isPrivateNetworkIp("192.168.1.10")).toBe(true);
    expect(isPrivateNetworkIp("8.8.8.8")).toBe(false);
  });

  it("supports explicit CIDR allow lists", () => {
    expect(
      isIpInAllowList("203.0.113.10", buildIpAllowList(["203.0.113.0/24"])),
    ).toBe(true);
    expect(
      isIpInAllowList("203.0.114.10", buildIpAllowList(["203.0.113.0/24"])),
    ).toBe(false);
  });

  it("uses adapter-resolved request IP for private-network request checks", () => {
    expect(
      isRequestFromPrivateNetwork({
        headers: { "x-forwarded-for": "127.0.0.1, 10.0.0.1" },
        ip: "203.0.113.9",
      }),
    ).toBe(false);
  });

  it("uses adapter-resolved or socket addresses instead of spoofable forwarding headers", () => {
    expect(
      getClientIp({
        headers: { "x-forwarded-for": "127.0.0.1, 10.0.0.1" },
        ip: "203.0.113.9",
        socket: { remoteAddress: "198.51.100.10" },
      }),
    ).toBe("203.0.113.9");
    expect(
      getClientIp({
        headers: { "x-forwarded-for": "127.0.0.1, 10.0.0.1" },
        socket: { remoteAddress: "127.0.0.1" },
      }),
    ).toBe("127.0.0.1");
  });
});
