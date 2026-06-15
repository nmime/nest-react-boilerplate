import type { TranslationKey } from "@app/common/i18n";
import type { ProviderIdentity, SocialAuthProvider } from "./types";

const providerKeys: Record<SocialAuthProvider, TranslationKey> = {
  discord: "auth.provider.discord",
  telegram: "auth.provider.telegram",
};

export const socialAuthProviders: SocialAuthProvider[] = [
  "telegram",
  "discord",
];

export const getProviderTranslationKey = (
  provider: SocialAuthProvider,
): TranslationKey => providerKeys[provider];

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const readBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const isSocialProvider = (value: unknown): value is SocialAuthProvider =>
  value === "telegram" || value === "discord";

export const normalizeProviderIdentity = (
  value: unknown,
): ProviderIdentity | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const provider = record.provider ?? record.authProvider;
  const id = readString(
    record.id ?? record.identityId ?? record.externalIdentityId,
  );

  if (!id || !isSocialProvider(provider)) {
    return null;
  }

  return {
    avatarUrl: readString(record.avatarUrl),
    displayName: readString(record.displayName ?? record.name),
    email: readString(record.email) ?? null,
    id,
    isLastMethod: readBoolean(record.isLastMethod ?? record.lastMethod),
    linkedAt: readString(record.linkedAt ?? record.createdAt),
    provider,
    providerSubject: readString(record.providerSubject ?? record.subject),
    username: readString(record.username),
  };
};

const readIdentityList = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["identities", "items", "providerIdentities", "data"]) {
    const candidate = record[key];
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
      discord:
        identities.find((identity) => identity.provider === "discord") ?? null,
      telegram:
        identities.find((identity) => identity.provider === "telegram") ?? null,
    },
  };
};

export const getExternalAuthStatus = (
  result: ExternalAuthResultLike,
): string => (typeof result.status === "string" ? result.status : "conflict");

interface ExternalAuthResultLike {
  status?: unknown;
}
