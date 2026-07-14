import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientOptions } from 'better-auth';
import { multiSessionClient } from 'better-auth/client/plugins';
import { telegramClient } from './telegram-client';

const getRuntimeEnvironment = (): Readonly<Record<string, string | undefined>> =>
  typeof process === 'undefined' ? {} : process.env;

export const resolveBetterAuthBaseUrl = (
  environment: Readonly<Record<string, string | undefined>> = getRuntimeEnvironment(),
): string => environment['NEXT_PUBLIC_API_URL'] ?? environment['VITE_API_BASE_URL'] ?? 'http://localhost:3003';

const options: BetterAuthClientOptions = {
  baseURL: resolveBetterAuthBaseUrl(),
  plugins: [multiSessionClient(), telegramClient],
};

export const authClient = createAuthClient(options);

// Destructured imperative API calls (proxied through InferClientAPI)
export const { signIn, signOut, signUp, useSession } = authClient;
