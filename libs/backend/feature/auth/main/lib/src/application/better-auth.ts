import { betterAuth } from "better-auth";
import type { BetterAuthOptions, Auth } from "better-auth";
import { multiTenantPlugin } from "./plugins/multi-tenant";
import { rbacPlugin } from "./plugins/rbac";
import { telegramPlugin } from "./plugins/telegram";
import { accountLinkingPlugin } from "./plugins/account-linking";

export interface BetterAuthConfigOptions {
  secret?: string;
  trustedOrigins?: string[];
  telegramBotToken?: string;
  discordClientId?: string;
  discordClientSecret?: string;
  discordRedirectUri?: string;
  allowedReturnUrls?: string[];
  sessionCookieName?: string;
  sessionMaxAge?: number;
}

export function getBetterAuthConfig(_orm: any, options: BetterAuthConfigOptions = {}): Auth {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error("DATABASE_URL is required for Better-Auth PostgreSQL driver");
  }

  const { Pool } = require("pg");
  const database = new Pool({ connectionString: dbUrl });

  const baseURL = getBaseUrl();

  const opts: BetterAuthOptions = {
    database,
    baseURL,
    trustedOrigins: options.trustedOrigins ?? getTrustedOrigins(),

    secret: options.secret ?? process.env.BETTER_AUTH_SECRET,

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === "true",
      sendResetPassword: async ({ user, url }: { user: any; url: string }) => {
        console.log("[better-auth] password reset for", user.email, url);
      },
    },

    socialProviders: {
      discord: {
        clientId: options.discordClientId ?? process.env.DISCORD_CLIENT_ID ?? "",
        clientSecret: options.discordClientSecret ?? process.env.DISCORD_CLIENT_SECRET ?? "",
        redirectURI: options.discordRedirectUri ?? process.env.DISCORD_REDIRECT_URI ?? "",
      },
    },

    session: {
      expiresIn: options.sessionMaxAge ?? 3600,
      updateAge: 600,
    },

    rateLimit: {
      enabled: process.env.NODE_ENV === "production",
      window: 10,
      max: 100,
    },

    plugins: [
      multiTenantPlugin,
      rbacPlugin,
      telegramPlugin({
        botToken: options.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN ?? "",
      }),
      accountLinkingPlugin({
        allowedReturnUrls:
          options.allowedReturnUrls ??
          process.env.ALLOWED_RETURN_URLS?.split(",").filter(Boolean) ??
          [],
      }),
    ],
  };

  return betterAuth(opts);
}

function getBaseUrl(): string {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.API_BASE_URL ??
    "http://localhost:3003"
  );
}

function getTrustedOrigins(): string[] {
  const configured = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").filter(Boolean);
  if (configured?.length) {return configured;}
  return [getBaseUrl()];
}
