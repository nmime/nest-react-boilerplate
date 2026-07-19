const allowedProtocols = new Set(['http:', 'https:']);

const browserOrigin = (): string | undefined =>
  typeof globalThis.location === 'undefined' ? undefined : globalThis.location.origin;

const parseSameOriginReturnUrl = (value?: string | null, origin: string | undefined = browserOrigin()): URL | null => {
  const normalizedValue = value?.trim();
  const isAbsoluteUrl = normalizedValue ? /^[a-z][a-z\d+.-]*:/iu.test(normalizedValue) : false;
  if (
    !normalizedValue ||
    !origin ||
    normalizedValue.startsWith('//') ||
    (!normalizedValue.startsWith('/') && !isAbsoluteUrl)
  ) {
    return null;
  }

  try {
    const baseUrl = new URL(origin);
    const returnUrl = new URL(normalizedValue, baseUrl);
    if (
      !allowedProtocols.has(baseUrl.protocol) ||
      !allowedProtocols.has(returnUrl.protocol) ||
      baseUrl.username !== '' ||
      baseUrl.password !== '' ||
      returnUrl.username !== '' ||
      returnUrl.password !== '' ||
      returnUrl.origin !== baseUrl.origin ||
      returnUrl.pathname.startsWith('//')
    ) {
      return null;
    }

    return returnUrl;
  } catch {
    return null;
  }
};

export const toAbsoluteSameOriginReturnUrl = (value?: string | null, origin?: string): string | undefined =>
  parseSameOriginReturnUrl(value, origin)?.toString();

export const toSameOriginReturnPath = (value?: string | null, origin?: string): string | null => {
  const returnUrl = parseSameOriginReturnUrl(value, origin);
  return returnUrl ? `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}` : null;
};
