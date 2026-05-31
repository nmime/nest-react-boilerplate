export function addTgUsernamesToMessage(
  message: string,
  usernames: readonly string[] = [],
): string {
  const suffix = usernames
    .filter((username) => username.trim().length > 0)
    .map((username) => (username.startsWith("@") ? username : `@${username}`))
    .join(" ");

  return suffix ? `${message}\n${suffix}` : message;
}
