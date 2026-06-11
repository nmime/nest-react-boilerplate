export const TELEGRAM_USERNAME_MIN_LENGTH = 5;
export const TELEGRAM_USERNAME_MAX_LENGTH = 32;

const TELEGRAM_USERNAME_PATTERN = new RegExp(
  `^[A-Za-z][A-Za-z0-9_]{${TELEGRAM_USERNAME_MIN_LENGTH - 1},${TELEGRAM_USERNAME_MAX_LENGTH - 1}}$`,
);
const TELEGRAM_USERNAME_SEPARATOR_PATTERN = /[,\s]+/u;

function parseTelegramUsernameCandidate(value: string): string | null {
  const normalized = value.trim().replace(/^@/u, "");

  if (normalized.length === 0) {
    return null;
  }

  return TELEGRAM_USERNAME_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeTelegramUsernames(
  usernames: readonly string[] = [],
): string[] {
  const uniqueUsernames = new Set<string>();
  const normalizedUsernames: string[] = [];

  for (const usernameListItem of usernames) {
    const usernameCandidates = usernameListItem
      .split(TELEGRAM_USERNAME_SEPARATOR_PATTERN)
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
