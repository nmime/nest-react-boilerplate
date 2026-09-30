import { supportedLocales } from '../i18n';
import type { TelegramBotAuthPort, TelegramBotIdentity, TelegramLinkedUserProfile } from '../type';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const MaxResponseBytes = 4_096;
const RequestTimeoutMs = 5_000;

export interface TelegramAuthBridgeConfig {
  /** Full internal endpoint prefix, including the host's API prefix. */
  url: string;
  secret: string;
}

export function resolveTelegramAuthBridgeConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramAuthBridgeConfig | undefined {
  const urlValue = env.TELEGRAM_BOT_AUTH_URL?.trim();
  const secret = env.TELEGRAM_BOT_AUTH_SECRET?.trim();
  if (!urlValue && !secret) {
    return undefined;
  }
  if (!urlValue || !secret || !/^[\x21-\x7e]{32,256}$/u.test(secret)) {
    throw new Error('Telegram bot auth bridge requires a URL and a dedicated 32–256 character service credential.');
  }
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error('TELEGRAM_BOT_AUTH_URL must be an absolute HTTPS endpoint.');
  }
  const isLocalDevelopment =
    env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalDevelopment)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'TELEGRAM_BOT_AUTH_URL requires HTTPS without URL credentials, query, or fragment; local development may use loopback HTTP.',
    );
  }
  while (url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
    if (url.pathname === '/') {
      break;
    }
  }
  const normalized = url.toString();
  return { url: normalized.endsWith('/') ? normalized.slice(0, -1) : normalized, secret };
}

/** The host is stateless: all ownership is re-resolved by the auth service. */
export function createTelegramAuthBridge(
  config: TelegramAuthBridgeConfig,
  options: { appUrl?: string; fetch?: typeof fetch } = {},
): TelegramBotAuthPort {
  const transport = options.fetch ?? globalThis.fetch;
  const request = async (
    action: 'resolve' | 'link' | 'locale',
    identity: TelegramBotIdentity,
    extra: Record<string, string> = {},
  ) => {
    if (!/^\d{1,20}$/u.test(identity.providerSubject)) {
      throw new Error('Invalid Telegram bot sender.');
    }
    try {
      const response = await transport(`${config.url}/${action}`, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(RequestTimeoutMs),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.secret}` },
        body: JSON.stringify({ providerSubject: identity.providerSubject, ...extra }),
      });
      if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        await response.body?.cancel();
        throw new Error('Invalid bridge response.');
      }
      const profile: unknown = JSON.parse(await readBoundedBody(response));
      if (profile === null) {
        return null;
      }
      if (!isLinkedUserProfile(profile)) {
        throw new Error('Invalid bridge profile.');
      }
      return { userId: profile.userId, tenantId: profile.tenantId, locale: profile.locale };
    } catch {
      // Transport errors can contain URLs, bearer credentials, or response data.
      throw new Error('Telegram account service is unavailable.');
    }
  };
  return {
    async consumeLinkPayload(payload, identity) {
      const token = /^(?:link_)?([A-Za-z0-9_-]{43})$/u.exec(payload)?.[1];
      if (!token) {
        return null;
      }
      const profile = await request('link', identity, { linkToken: token });
      if (!profile) {
        throw new Error('Telegram account link was not established.');
      }
      return { kind: 'link', ...(profile.locale ? { locale: profile.locale } : {}) };
    },
    createLinkInstructions() {
      return Promise.resolve(options.appUrl ?? null);
    },
    findLinkedUser(identity) {
      return request('resolve', identity);
    },
    async updateLinkedUserLocale({ identity, locale }) {
      if (!(await request('locale', identity, { locale }))) {
        throw new Error('Telegram account locale was not saved.');
      }
    },
  };
}

function isLinkedUserProfile(value: unknown): value is TelegramLinkedUserProfile & { tenantId: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.userId === 'string' &&
    uuidPattern.test(profile.userId) &&
    typeof profile.tenantId === 'string' &&
    uuidPattern.test(profile.tenantId) &&
    (profile.locale === null ||
      (typeof profile.locale === 'string' && supportedLocales.some((locale) => locale === profile.locale)))
  );
}

async function readBoundedBody(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error('Empty bridge response.');
  }
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return Buffer.concat(parts).toString('utf8');
      }
      size += value.byteLength;
      if (size > MaxResponseBytes) {
        throw new Error('Oversized bridge response.');
      }
      parts.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
