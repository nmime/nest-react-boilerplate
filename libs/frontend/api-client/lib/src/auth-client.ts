import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientOptions } from 'better-auth';
import { multiSessionClient } from 'better-auth/client/plugins';
import { telegramClient } from './telegram-client';

const options: BetterAuthClientOptions = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || process.env.VITE_API_BASE_URL || 'http://localhost:3003',
  plugins: [multiSessionClient(), telegramClient],
};

export const authClient = createAuthClient(options);

// Destructured imperative API calls (proxied through InferClientAPI)
export const { signIn, signOut, signUp, useSession } = authClient;
