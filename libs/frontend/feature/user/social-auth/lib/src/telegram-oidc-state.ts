import type { SocialAuthRequestInput } from './types';

const TelegramOidcStateKey = 'telegramOidcAuthState';

const isSocialAuthIntent = (value: unknown): value is 'link' | 'login' => value === 'link' || value === 'login';

export const saveTelegramOidcState = (input: SocialAuthRequestInput): void => {
  try {
    globalThis.sessionStorage.setItem(TelegramOidcStateKey, JSON.stringify(input));
  } catch {
    // Login remains usable when storage is unavailable. Link metadata is
    // intentionally not placed in the callback URL or browser history.
  }
};

export const readTelegramOidcState = (): SocialAuthRequestInput => {
  try {
    const value = globalThis.sessionStorage.getItem(TelegramOidcStateKey);
    if (!value) {
      return {};
    }
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      intent: isSocialAuthIntent(parsed.intent) ? parsed.intent : undefined,
      linkToken: typeof parsed.linkToken === 'string' ? parsed.linkToken : undefined,
      returnUrl: typeof parsed.returnUrl === 'string' ? parsed.returnUrl : undefined,
    };
  } catch {
    return {};
  }
};

export const clearTelegramOidcState = (): void => {
  try {
    globalThis.sessionStorage.removeItem(TelegramOidcStateKey);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
};
