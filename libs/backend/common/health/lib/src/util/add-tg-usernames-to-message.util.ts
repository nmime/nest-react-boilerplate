export const TelegramUsernameMinLength = 5;
export const TelegramUsernameMaxLength = 32;

const telegramUsernamePattern = new RegExp(
  `^[A-Za-z][A-Za-z0-9_]{${TelegramUsernameMinLength - 1},${TelegramUsernameMaxLength - 1}}$`,
);
const telegramUsernameSeparatorPattern = /[,\s]+/u;

function parseTelegramUsernameCandidate(value: string): string | null {
  const normalized = value.trim().replace(/^@/u, "");

  if (normalized.length === 0) {
    return null;
  }

  return telegramUsernamePattern.test(normalized) ? normalized : null;
}

export function normalizeTelegramUsernames(
  usernames: readonly string[] = [],
): string[] {
  const uniqueUsernames = new Set<string>();
  const normalizedUsernames: string[] = [];

  for (const usernameListItem of usernames) {
    const usernameCandidates = usernameListItem
      .split(telegramUsernameSeparatorPattern)
      .map(parseTelegramUsernameCandidate)
      .filter((username): username is string => username !== null);

    for (const username of usernameCandidates) {
      const dedupeKey = username.toLowerCase();

      if (!uniqueUsernames.has(dedupeKey)) {
        uniqueUsernames.add(dedupeKey);
        normalizedUsernames.push(`@${username}`);
      }
    }
  }

  return normalizedUsernames;
}

export function addTgUsernamesToMessage(
  message: string,
  usernames: readonly string[] = [],
): string {
  const suffix = normalizeTelegramUsernames(usernames).join(" ");

  if (suffix.length === 0) {
    return message;
  }

  const separator = message.endsWith("\n") ? "" : "\n";

  return `${message}${separator}${suffix}`;
}
