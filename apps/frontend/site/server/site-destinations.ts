export interface SiteDestinations {
  userApp?: string;
  landingApp?: string;
}

/** Public navigation only: credentials, query strings and protocol-relative URLs are forbidden. */
export function resolveSiteDestinations(env: Record<string, string | undefined>): SiteDestinations {
  const resolveHref = (raw: string | undefined): string | undefined => {
    const value = raw?.trim();
    if (!value) {
      return undefined;
    }
    try {
      const base = new URL('https://same-origin.invalid');
      const relative = value.startsWith('/') && !value.startsWith('//');
      const url = relative ? new URL(value, base) : new URL(value);
      const loopback =
        env.SITE_ALLOW_LOOPBACK_HTTP === 'true' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname);
      if (
        (relative ? url.origin !== base.origin : url.protocol !== 'https:' && !loopback) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        return undefined;
      }
      return relative ? url.pathname : url.href;
    } catch {
      return undefined;
    }
  };
  return { userApp: resolveHref(env.SITE_USER_APP_URL), landingApp: resolveHref(env.SITE_LANDING_APP_URL) };
}
