import * as adminApi from "./admin";
import * as authApi from "./auth";
import * as generatedAdminApi from "./generated/admin";
import * as generatedAuthApi from "./generated/auth";
import * as generatedUserApi from "./generated/user";
import * as userApi from "./user";

export {
  adminApi,
  authApi,
  generatedAdminApi,
  generatedAuthApi,
  generatedUserApi,
  userApi,
};

export * from "./client-registry";
export * from "./service-options";
export * from "./toast-rules";

// Better-Auth client integrations (our additions)
export { authClient, signIn, signOut, signUp, useSession } from "./auth-client";
export { telegramClient } from "./telegram-client";
export { useAuthSessionFlow, useSocialAuth, useSignOut as useSignOutFlow } from "./use-auth-session-flow";
