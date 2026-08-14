import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientOptions } from 'better-auth';
import { genericOAuthClient, multiSessionClient } from 'better-auth/client/plugins';
import { telegramClient } from './telegram-client';

const getRuntimeEnvironment = (): Readonly<Record<string, string | undefined>> => {
  const processEnvironment = typeof process === 'undefined' ? {} : process.env;
  // `vite/client` declares `import.meta.env` as always present, so an intersection cannot make it
  // optional again. Spreading it unguarded is still safe on a runtime that has no Vite: spreading
  // `undefined` contributes nothing, which is exactly the intent a `?? {}` would have spelled out.
  const viteEnvironment = (
    import.meta as ImportMeta & {
      env: Readonly<Record<string, string | undefined>>;
    }
  ).env;
  return { ...processEnvironment, ...viteEnvironment };
};

export const resolveBetterAuthBaseUrl = (
  environment: Readonly<Record<string, string | undefined>> = getRuntimeEnvironment(),
): string => {
  if (environment['VITE_API_BASE_URL_MODE']?.trim().toLowerCase() === 'same-origin') {
    return typeof globalThis.location === 'undefined' ? 'http://localhost:3003' : globalThis.location.origin;
  }

  const pickConfigured = (value?: string): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };

  return (
    pickConfigured(environment['VITE_AUTH_API_BASE_URL']) ??
    pickConfigured(environment['NEXT_PUBLIC_API_URL']) ??
    pickConfigured(environment['VITE_API_BASE_URL']) ??
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
