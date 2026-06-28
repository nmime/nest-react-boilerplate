import type { TranslationKey, TranslationParams } from "./locale";

export type DomainNamespace = `domain.${string}`;
export type DomainTranslate = (
  key: string,
  params?: TranslationParams,
) => string;
export type RootTranslate = (
  key: TranslationKey,
  params?: TranslationParams,
) => string;

export function createDomainTranslationKey(
  namespace: DomainNamespace,
  key: string,
): TranslationKey {
  return `${namespace}.${key}` as TranslationKey;
}

export function createDomainTranslator(
  translate: RootTranslate,
  namespace: DomainNamespace,
): DomainTranslate {
  return (key, params) =>
    translate(createDomainTranslationKey(namespace, key), params);
}
