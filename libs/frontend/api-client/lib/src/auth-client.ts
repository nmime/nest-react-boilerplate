import { createAuthClient } from "better-auth/react";
import { multiTenantClient } from "better-auth/client/plugins";
import { telegramClient as telegramAuthClient } from "./telegram-client";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || process.env.VITE_API_BASE_URL || "http://localhost:3003",
  plugins: [
    multiTenantClient(),
    telegramAuthClient(),
  ],
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  useSignIn,
  useSignUp,
  useSignOut,
  useListAccounts,
  useRemoveAccount,
  useSendVerificationEmail,
} = authClient;
