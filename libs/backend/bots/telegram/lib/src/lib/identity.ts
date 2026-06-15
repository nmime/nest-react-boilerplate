import { normalizeLocale } from "@app/common/i18n";
import type { TelegramBotContext, TelegramBotIdentity } from "./types";

export function resolveTelegramIdentity(
  ctx: Pick<TelegramBotContext, "from">,
): TelegramBotIdentity | null {
  const from = ctx.from;
  if (!from) {
    return null;
  }

  const displayName = [from.first_name, from.last_name]
    .filter(Boolean)
    .join(" ");

  return {
    provider: "telegram",
    channel: "telegram_bot",
    providerSubject: String(from.id),
    username: from.username ?? null,
    displayName: displayName || null,
    locale: normalizeLocale(from.language_code) ?? null,
    avatarUrl: null,
  };
}
