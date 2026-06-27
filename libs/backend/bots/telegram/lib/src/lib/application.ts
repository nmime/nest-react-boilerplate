import type { Locale } from "@app/common/i18n";
import type {
  TelegramBotAuthPort,
  TelegramBotDependencies,
  TelegramBotIdentity,
  TelegramLinkedUserProfile,
  TelegramLinkPayload,
} from "./types";

export interface TelegramUpdateLinkedUserLocaleInput {
  identity: TelegramBotIdentity;
  locale: Locale;
  userId?: string;
  tenantId?: string | null;
}

export interface TelegramBotApplicationPort {
  consumeStartPayload(
    payload: string,
    identity: TelegramBotIdentity,
  ): Promise<TelegramLinkPayload | null>;
  createLinkInstructions(identity: TelegramBotIdentity): Promise<string | null>;
  findLinkedUser(
    identity: TelegramBotIdentity,
  ): Promise<TelegramLinkedUserProfile | null>;
  updateLinkedUserLocale(
    input: TelegramUpdateLinkedUserLocaleInput,
  ): Promise<void>;
}

export function createTelegramApplication(
  dependencies: TelegramBotDependencies = {},
): TelegramBotApplicationPort {
  return new TelegramAuthApplicationAdapter(dependencies.auth);
}

export function resolveTelegramApplication(
  input?: TelegramBotApplicationPort | TelegramBotDependencies,
): TelegramBotApplicationPort {
  if (isTelegramApplication(input)) {
    return input;
  }

  return createTelegramApplication(input);
}

class TelegramAuthApplicationAdapter implements TelegramBotApplicationPort {
  constructor(private readonly auth?: TelegramBotAuthPort) {}

  async consumeStartPayload(
    payload: string,
    identity: TelegramBotIdentity,
  ): Promise<TelegramLinkPayload | null> {
    return this.auth?.consumeLinkPayload(payload, identity) ?? null;
  }

  async createLinkInstructions(
    identity: TelegramBotIdentity,
  ): Promise<string | null> {
    return this.auth?.createLinkInstructions(identity) ?? null;
  }

  async findLinkedUser(
    identity: TelegramBotIdentity,
  ): Promise<TelegramLinkedUserProfile | null> {
    return this.auth?.findLinkedUser(identity) ?? null;
  }

  async updateLinkedUserLocale(
    input: TelegramUpdateLinkedUserLocaleInput,
  ): Promise<void> {
    await this.auth?.updateLinkedUserLocale(input);
  }
}

function isTelegramApplication(
  input: TelegramBotApplicationPort | TelegramBotDependencies | undefined,
): input is TelegramBotApplicationPort {
  return Boolean(
    input &&
    "consumeStartPayload" in input &&
    "createLinkInstructions" in input &&
    "findLinkedUser" in input &&
    "updateLinkedUserLocale" in input,
  );
}
