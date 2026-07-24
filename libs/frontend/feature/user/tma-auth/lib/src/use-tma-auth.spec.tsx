import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const retrieveLaunchParams = vi.fn();
const retrieveRawInitData = vi.fn();

vi.mock('@tma.js/sdk-react', () => ({
  deepSnakeToCamelObjKeys: (value: unknown) => value,
  retrieveLaunchParams: () => retrieveLaunchParams(),
  retrieveRawInitData: () => retrieveRawInitData(),
}));

const { useTmaAuth } = await import('./use-tma-auth');

const args = (over: Partial<Parameters<typeof useTmaAuth>[0]> = {}) => ({
  error: null,
  isVerifying: false,
  onAuthenticate: vi.fn(),
  status: 'idle',
  ...over,
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('useTmaAuth', () => {
  it('authenticates inside Telegram using the launch start param', () => {
    retrieveRawInitData.mockReturnValue('raw-init-data');
    retrieveLaunchParams.mockReturnValue({ tgWebAppStartParam: 'profile' });
    const onAuthenticate = vi.fn();

    const { result } = renderHook(() => useTmaAuth(args({ onAuthenticate })));

    expect(result.current.isTelegram).toBe(true);
    expect(onAuthenticate).toHaveBeenCalledWith({
      initData: 'raw-init-data',
      intent: 'login',
      returnUrl: '/profile',
    });
  });

  it('falls back to browser state outside Telegram and does not authenticate', () => {
    retrieveRawInitData.mockImplementation(() => {
      throw new Error('not telegram');
    });
    retrieveLaunchParams.mockImplementation(() => {
      throw new Error('not telegram');
    });
    const onAuthenticate = vi.fn();

    const { result } = renderHook(() => useTmaAuth(args({ onAuthenticate, fallbackStartParam: 'link_telegram' })));

    expect(result.current.isTelegram).toBe(false);
    expect(result.current.intent).toBe('link');
    expect(onAuthenticate).not.toHaveBeenCalled();
  });

  it('reads the browser start param from the query string', () => {
    retrieveRawInitData.mockImplementation(() => {
      throw new Error('not telegram');
    });
    retrieveLaunchParams.mockReturnValue({});
    window.history.replaceState(null, '', '/tma?startapp=settings');

    const { result } = renderHook(() => useTmaAuth(args()));

    expect(result.current.mappedRoute).toBe('/settings');
  });

  it('does not re-authenticate while a verification is already in flight', () => {
    retrieveRawInitData.mockReturnValue('raw-init-data');
    retrieveLaunchParams.mockReturnValue({});
    const onAuthenticate = vi.fn();

    renderHook(() => useTmaAuth(args({ onAuthenticate, status: 'pending' })));

    expect(onAuthenticate).not.toHaveBeenCalled();
  });

  it('only reads raw Telegram init data, never the unsafe payload', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'use-tma-auth.ts'), 'utf8');

    expect(source).toContain('retrieveRawInitData');
    expect(source).not.toContain('init' + 'DataUnsafe');
  });
});
