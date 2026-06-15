import {
  fallbackLocale,
  normalizeLocale,
  supportedLocales,
  translate,
  translations,
  type Locale,
  type TranslationKey,
} from "@app/common/i18n";
import type { APIInteraction } from "discord-api-types/v10";

export function t(
  key: TranslationKey,
  locale: string | null | undefined,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  return translate(key, { locale: resolveDiscordLocale(locale), params });
}

export function resolveDiscordLocale(
  ...values: Array<string | null | undefined>
): Locale {
  for (const value of values) {
    const locale = normalizeLocale(value);
    if (locale) {
      return locale;
    }
  }
  return fallbackLocale;
}

export async function resolveInteractionLocale(
  interaction: APIInteraction,
  externalAuth?: {
    listProviderIdentities: (
      userId: string,
      tenantId: string,
    ) => Promise<Array<{ provider: string; providerSubject: string }>>;
  },
  tenantId?: string,
): Promise<Locale> {
  const maybeInteraction = interaction as {
    user?: { id: string };
    member?: { user?: { id: string } };
    locale?: string;
    guild_locale?: string;
  };
  const userId = maybeInteraction.user?.id ?? maybeInteraction.member?.user?.id;
  if (userId && externalAuth && tenantId) {
    try {
      const identities = await externalAuth.listProviderIdentities(
        userId,
        tenantId,
      );
      const linkedIdentity = identities.find(
        (identity) =>
          identity.provider === "discord" &&
          identity.providerSubject === userId,
      );
      const metadata = linkedIdentity
        ? ((
            linkedIdentity as unknown as {
              profileMetadata?: { locale?: string };
            }
          ).profileMetadata ?? {})
        : {};
      const resolved = normalizeLocale(metadata.locale);
      if (resolved) {
        return resolved;
      }
    } catch {
      // Locale resolution must not fail Discord's 3 second interaction response.
    }
  }
  return resolveDiscordLocale(
    maybeInteraction.locale,
    maybeInteraction.guild_locale,
  );
}

export function localizationsFor(key: TranslationKey): Record<string, string> {
  const entries = supportedLocales
    .filter((locale) => locale !== fallbackLocale)
    .map((locale) => [locale, translations[locale][key]] as const)
    .filter(([, value]) => Boolean(value));
  return Object.fromEntries(entries);
}
