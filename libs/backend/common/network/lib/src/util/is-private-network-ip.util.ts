import { PrivateNetworkCidrs } from '../const';
import { getClientIp, type RequestWithClientAddress } from './client-ip.util';

export interface IpAllowListEntry {
  cidr: string;
  base: number;
  mask: number;
}

function parseOctet(part: string): number | undefined {
  const octet = Number.parseInt(part, 10);
  return Number.isInteger(octet) && octet >= 0 && octet <= 255 && String(octet) === part ? octet : undefined;
}

function parseIpv4(ip: string): number | undefined {
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const parts = normalized.split('.');
  const [first, second, third, fourth] = parts;
  if (
    parts.length !== 4 ||
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined
  ) {
    return undefined;
  }

  const octet1 = parseOctet(first);
  const octet2 = parseOctet(second);
  const octet3 = parseOctet(third);
  const octet4 = parseOctet(fourth);
  if (octet1 === undefined || octet2 === undefined || octet3 === undefined || octet4 === undefined) {
    return undefined;
  }

  return ((octet1 << 24) >>> 0) + ((octet2 << 16) >>> 0) + ((octet3 << 8) >>> 0) + octet4;
}

export function parseCidr(cidr: string): IpAllowListEntry {
  const [ip = '', bitsRaw = '32'] = cidr.split('/');
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

export function buildIpAllowList(cidrs: readonly string[] = PrivateNetworkCidrs): IpAllowListEntry[] {
  return cidrs.filter((cidr) => cidr.trim().length > 0).map(parseCidr);
}

export function isIpInAllowList(
  ip: string | undefined | null,
  allowList: readonly IpAllowListEntry[] = buildIpAllowList(),
): boolean {
  if (!ip) {
    return false;
  }

  if (ip === '::1') {
    return true;
  }

  const parsed = parseIpv4(ip);
  if (parsed === undefined) {
    return false;
  }

  return allowList.some((entry) => (parsed & entry.mask) === entry.base);
}

export const isPrivateNetworkIp = (ip: string | undefined | null): boolean => isIpInAllowList(ip, buildIpAllowList());

export function isRequestFromPrivateNetwork(
  request: RequestWithClientAddress,
  allowList: readonly IpAllowListEntry[] = buildIpAllowList(),
): boolean {
  return isIpInAllowList(getClientIp(request), allowList);
}
