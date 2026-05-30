export class BotLangResolver {
  resolve(headers: Record<string, string | string[] | undefined> = {}): string {
    const value = headers["x-locale"] ?? headers["accept-language"];
    const locale = Array.isArray(value) ? value[0] : value;
    return locale?.split(",")[0]?.trim() || "en";
  }
}
