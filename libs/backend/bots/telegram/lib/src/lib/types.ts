import type { Api, Context, SessionFlavor } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import type { HydrateFlavor } from "@grammyjs/hydrate";
import type { MenuFlavor } from "@grammyjs/menu";
import type { ConversationFlavor } from "@grammyjs/conversations";
import type { Locale, TranslationKey } from "@app/common/i18n";

export const telegramBotRoutes = [
  "main",
  "profile",
  "settings",
  "settings.language",
  "settings.language.confirm",
  "support",
  "support.contact",
  "link",
  "link.instructions",
] as const;

export type TelegramBotRoute = (typeof telegramBotRoutes)[number];

export interface TelegramBotSession {
  locale?: Locale;
  currentRoute: TelegramBotRoute;
  stack: TelegramBotRoute[];
  params: Record<string, string>;
  auth: {
    userId?: string;
    tenantId?: string;
    linked: boolean;
    linkedLocale?: Locale;
  };
  lastMenuId?: string;
  identityLocale?: Locale;
  rateLimitedUntil?: number;
}

export interface TelegramLinkedUserProfile {
  userId: string;
  tenantId?: string | null;
  locale?: Locale | null;
}

export interface TelegramLinkPayload {
  kind: "link" | "route";
  token?: string;
  route?: TelegramBotRoute;
  params?: Record<string, string>;
  locale?: Locale;
}

export interface TelegramBotAuthPort {
  consumeLinkPayload(
    payload: string,
    identity: TelegramBotIdentity,
  ): Promise<TelegramLinkPayload | null>;
  createLinkInstructions(identity: TelegramBotIdentity): Promise<string | null>;
  findLinkedUser(
    identity: TelegramBotIdentity,
  ): Promise<TelegramLinkedUserProfile | null>;
  updateLinkedUserLocale(input: {
    identity: TelegramBotIdentity;
    locale: Locale;
    userId?: string;
    tenantId?: string | null;
  }): Promise<void>;
}

export interface TelegramBotIdentity {
  provider: "telegram";
  channel: "telegram_bot";
  providerSubject: string;
  username: string | null;
  displayName: string | null;
  locale: Locale | null;
  avatarUrl: string | null;
}

export interface TelegramBotConfig {
  token: string;
  appUrl?: string;
  webhookSecret?: string;
  mode: "webhook" | "polling";
  environment: "production" | "development" | "test";
  sessionTtlSeconds: number;
  rateLimit: {
    timeFrameMs: number;
    limit: number;
  };
  botInfo?: UserFromGetMe;
}

export interface TelegramBotDependencies {
  auth?: TelegramBotAuthPort;
  api?: Api;
  now?: () => Date;
  sessionStorage?: import("grammy").StorageAdapter<TelegramBotSession>;
  rateLimitStorage?: {
    incr(key: string): Promise<number>;
    pexpire(key: string, milliseconds: number): Promise<number>;
  };
  fetch?: typeof fetch;
}

export type TelegramBaseContext = Context &
  SessionFlavor<TelegramBotSession> &
  MenuFlavor &
  ConversationFlavor<Context> & {
    t: (key: TranslationKey) => string;
    route: TelegramBotRoute;
    identity: TelegramBotIdentity | null;
  };

export type TelegramBotContext = TelegramBaseContext &
  HydrateFlavor<TelegramBaseContext>;

export interface TelegramBotInstance {
  bot: import("grammy").Bot<TelegramBotContext>;
  menus: {
    main: import("@grammyjs/menu").Menu<TelegramBotContext>;
  };
  config: TelegramBotConfig;
}
