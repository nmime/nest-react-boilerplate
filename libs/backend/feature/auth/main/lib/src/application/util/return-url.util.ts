import { BadRequestException } from '@nestjs/common';
import { readList } from './external-auth.util';

const AllowedReturnUrlProtocols = new Set(['http:', 'https:']);

export function assertReturnUrlAllowed(returnUrl?: string | null): void {
  if (!returnUrl) {
    return;
  }
  const allowed = readList(process.env.AUTH_ALLOWED_RETURN_URLS) ?? [];
  if (allowed.length === 0) {
    throw new BadRequestException('return_url_not_allowed');
  }
  if (!isReturnUrlAllowed(returnUrl, allowed)) {
    throw new BadRequestException('return_url_not_allowed');
  }
}

// Structured origin+path comparison. Raw-string prefix matching is unsafe:
// "https://app.example.com" would accept "https://app.example.com.evil.com".
// Return URLs must be absolute http(s) URLs (relative return URLs are not
// supported; allowlist entries must be absolute origins) with no embedded
// credentials, whose origin exactly matches an allowlist entry and whose path
// is contained within the entry's path at a segment boundary.
export function isReturnUrlAllowed(returnUrl: string, allowed: string[]): boolean {
  const target = parseAbsoluteUrl(returnUrl);
  if (!target || !AllowedReturnUrlProtocols.has(target.protocol) || target.username !== '' || target.password !== '') {
    return false;
  }

  return allowed.some((entry) => {
    const allowedUrl = parseAbsoluteUrl(entry);
    if (!allowedUrl || !AllowedReturnUrlProtocols.has(allowedUrl.protocol)) {
      return false;
    }
    if (target.protocol !== allowedUrl.protocol) {
      return false;
    }
    if (normalizeReturnUrlHost(target) !== normalizeReturnUrlHost(allowedUrl)) {
      return false;
    }
    // Only pin the port when the allowlist entry specifies a non-default one.
    if (allowedUrl.port !== '' && target.port !== allowedUrl.port) {
      return false;
    }
    return isPathWithinBoundary(target.pathname, allowedUrl.pathname);
  });
}

export function parseAbsoluteUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

export function normalizeReturnUrlHost(url: URL): string {
  return url.hostname.replace(/\.$/, '').toLowerCase();
}

export function isPathWithinBoundary(targetPath: string, entryPath: string): boolean {
  const normalizedEntry = entryPath.endsWith('/') ? entryPath.slice(0, -1) : entryPath;
  return targetPath === entryPath || targetPath === normalizedEntry || targetPath.startsWith(`${normalizedEntry}/`);
}
