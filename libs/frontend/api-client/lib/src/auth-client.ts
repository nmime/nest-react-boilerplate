import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientOptions } from 'better-auth';
import { genericOAuthClient, multiSessionClient } from 'better-auth/client/plugins';
import { telegramClient } from './telegram-client';

const getRuntimeEnvironment = (): Readonly<Record<string, string | undefined>> => {
  const processEnvironment = typeof process === 'undefined' ? {} : process.env;
  const viteEnvironment = (
    import.meta as ImportMeta & {
      env?: Readonly<Record<string, string | undefined>>;
    }
  ).env;
  return { ...processEnvironment, ...(viteEnvironment ?? {}) };
};

export const resolveBetterAuthBaseUrl = (
  environment: Readonly<Record<string, string | undefined>> = getRuntimeEnvironment(),
): string => {
  if (environment['VITE_API_BASE_URL_MODE']?.trim().toLowerCase() === 'same-origin') {
    return typeof globalThis.location === 'undefined' ? 'http://localhost:3003' : globalThis.location.origin;
  }

  return (
    environment['VITE_AUTH_API_BASE_URL'] ??
    environment['NEXT_PUBLIC_API_URL'] ??
    environment['VITE_API_BASE_URL'] ??
    (typeof globalThis.location === 'undefined' ? 'http://localhost:3003' : globalThis.location.origin)
  );
};

const options: BetterAuthClientOptions = {
  baseURL: resolveBetterAuthBaseUrl(),
  plugins: [genericOAuthClient(), multiSessionClient(), telegramClient],
};

export const authClient = createAuthClient(options);

// Destructured imperative API calls (proxied through InferClientAPI)
export const { signIn, signOut, signUp, useSession } = authClient;
