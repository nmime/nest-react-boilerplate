import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearTelegramOidcState, readTelegramOidcState, saveTelegramOidcState } from './telegram-oidc-state';

const KEY = 'telegramOidcAuthState';

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe('telegram OIDC state', () => {
  it('round-trips a valid state and coerces invalid fields on read', () => {
    saveTelegramOidcState({ intent: 'link', linkToken: 'tok', returnUrl: '/settings' });
    expect(readTelegramOidcState()).toEqual({ intent: 'link', linkToken: 'tok', returnUrl: '/settings' });

    window.sessionStorage.setItem(KEY, JSON.stringify({ intent: 'bogus', linkToken: 42, returnUrl: 7 }));
    expect(readTelegramOidcState()).toEqual({ intent: undefined, linkToken: undefined, returnUrl: undefined });
  });

  it('returns an empty state when nothing is stored or parsing fails', () => {
    expect(readTelegramOidcState()).toEqual({});
    window.sessionStorage.setItem(KEY, '{not json');
    expect(readTelegramOidcState()).toEqual({});
  });

  it('clears stored state', () => {
    saveTelegramOidcState({ intent: 'login' });
    clearTelegramOidcState();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('swallows storage failures on save, read, and clear', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    vi.stubGlobal('sessionStorage', throwing);

    expect(() => {
      saveTelegramOidcState({ intent: 'login' });
    }).not.toThrow();
    expect(readTelegramOidcState()).toEqual({});
    expect(() => {
      clearTelegramOidcState();
    }).not.toThrow();
  });
});
