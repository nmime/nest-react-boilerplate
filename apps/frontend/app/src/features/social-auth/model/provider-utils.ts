import type { TranslationKey } from "@app/frontend-runtime";
import { SocialAuthProvider, type ProviderIdentity } from "./types";

const providerKeys: Record<SocialAuthProvider, TranslationKey> = {
  [SocialAuthProvider.Discord]: "auth.provider.discord",
  [SocialAuthProvider.Telegram]: "auth.provider.telegram",
};

export const socialAuthProviders: SocialAuthProvider[] = [
  SocialAuthProvider.Telegram,
  SocialAuthProvider.Discord,
];

export const getProviderTranslationKey = (
  provider: SocialAuthProvider,
): TranslationKey => providerKeys[provider];

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const readBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const isSocialProvider = (value: unknown): value is SocialAuthProvider =>
  value === SocialAuthProvider.Telegram || value === SocialAuthProvider.Discord;

export const normalizeProviderIdentity = (
  value: unknown,
): ProviderIdentity | null => {
  if (!isRecord(value)) {
    return null;
  }

  const provider = value.provider ?? value.authProvider;
  const id = readString(
    value.id ?? value.identityId ?? value.externalIdentityId,
  );

  if (!id || !isSocialProvider(provider)) {
    return null;
  }

  return {
    avatarUrl: readString(value.avatarUrl),
    displayName: readString(value.displayName ?? value.name),
    email: readString(value.email) ?? null,
    id,
    isLastMethod: readBoolean(value.isLastMethod ?? value.lastMethod),
    linkedAt: readString(value.linkedAt ?? value.createdAt),
    provider,
    providerSubject: readString(value.providerSubject ?? value.subject),
    username: readString(value.username),
  };
};

const readIdentityList = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["identities", "items", "providerIdentities", "data"]) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
};

export const normalizeProviderIdentities = (payload: unknown) => {
  const identities = readIdentityList(payload).flatMap((item) => {
    const identity = normalizeProviderIdentity(item);
    return identity ? [identity] : [];
  });

  return {
    identities,
    providers: {
      [SocialAuthProvider.Discord]:
        identities.find(
          (identity) => identity.provider === SocialAuthProvider.Discord,
        ) ?? null,
      [SocialAuthProvider.Telegram]:
        identities.find(
          (identity) => identity.provider === SocialAuthProvider.Telegram,
        ) ?? null,
    },
  };
};
