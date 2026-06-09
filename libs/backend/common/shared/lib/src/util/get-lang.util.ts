import { Language } from "../const";

export const getLang = (request?: {
  headers?: Record<string, string | string[] | undefined>;
  locale?: string;
}): Language => {
  const header = request?.headers?.["accept-language"];
  const value = request?.locale ?? (Array.isArray(header) ? header[0] : header);
  return value?.startsWith("ru") ? Language.Ru : Language.En;
};
