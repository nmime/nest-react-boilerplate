import { PrivateNetworkCidrs } from "../const";
import { getClientIp, type RequestWithClientAddress } from "./client-ip.util";

export interface IpAllowListEntry {
  cidr: string;
  base: number;
  mask: number;
}

function parseIpv4(ip: string): number | undefined {
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const parts = normalized.split(".");
  if (parts.length !== 4) {
    return undefined;
  }

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (
    octets.some(
      (octet, index) =>
        !Number.isInteger(octet) ||
        octet < 0 ||
        octet > 255 ||
        String(octet) !== parts[index],
    )
  ) {
    return undefined;
  }

  return (
    ((octets[0] << 24) >>> 0) +
    ((octets[1] << 16) >>> 0) +
    ((octets[2] << 8) >>> 0) +
    octets[3]
  );
}

export function parseCidr(cidr: string): IpAllowListEntry {
  const [ip, bitsRaw = "32"] = cidr.split("/");
  const bits = Number.parseInt(bitsRaw, 10);
  const base = parseIpv4(ip);
  if (base === undefined || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    throw new Error(`Invalid IPv4 CIDR: ${cidr}`);
  }

  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return {
    cidr,
    base: base & mask,
    mask,
  };
}

export function buildIpAllowList(
  cidrs: readonly string[] = PrivateNetworkCidrs,
): IpAllowListEntry[] {
  return cidrs.filter((cidr) => cidr.trim().length > 0).map(parseCidr);
}

export function isIpInAllowList(
  ip: string | undefined | null,
  allowList: readonly IpAllowListEntry[] = buildIpAllowList(),
): boolean {
  if (!ip) {
    return false;
  }

  if (ip === "::1") {
    return true;
  }

  const parsed = parseIpv4(ip);
  if (parsed === undefined) {
    return false;
  }

  return allowList.some((entry) => (parsed & entry.mask) === entry.base);
}

export const isPrivateNetworkIp = (ip: string | undefined | null): boolean =>
  isIpInAllowList(ip, buildIpAllowList());

export function isRequestFromPrivateNetwork(
  request: RequestWithClientAddress,
  allowList: readonly IpAllowListEntry[] = buildIpAllowList(),
): boolean {
  return isIpInAllowList(getClientIp(request), allowList);
}
