import { registeredProblemCodeFromType } from '@app/common-problem-details';
import type { TranslationKey } from '@app/common-i18n-keys';
import {
  defaultLocale,
  hasTranslationKey,
  interpolate,
  normalizeLocale,
  translate,
  translations,
} from '@app/backend-common-i18n';
import type { ProblemDetailsResponse } from '../type/problem-details.type';
import { isObjectRecord } from './is-object-record.util';
import { problemCodeForStatus } from './problem-code-for-status.util';

function propertyFromPointer(pointer: string): string {
  if (!pointer.startsWith('#/')) {
    return 'value';
  }

  return pointer
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/gu, '/').replace(/~0/gu, '~'))
    .join('.');
}

function translateValidationIssue(detail: string, pointer: string, locale: string | undefined): string {
  const property = propertyFromPointer(pointer);
  const key = Object.entries(translations.en).find(
    ([translationKey, englishMessage]) =>
      translationKey.startsWith('validation.constraints.') && interpolate(englishMessage, { property }) === detail,
  )?.[0];

  return key ? translate(key as TranslationKey, { locale, params: { property } }) : detail;
}

function localizeValidationIssues(value: unknown, locale: string | undefined): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((issue): unknown => {
    if (!isObjectRecord(issue) || typeof issue.detail !== 'string' || typeof issue.pointer !== 'string') {
      return issue;
    }

    return {
      detail: translateValidationIssue(issue.detail, issue.pointer, locale),
      pointer: issue.pointer,
    };
  });
}

/**
 * Resolves against the composed catalog rather than the base array, so a problem type a product
 * registered keeps its own identity here. Resolving against the base array only meant a registered
 * type fell through to `problemCodeForStatus`, and for any status the boilerplate translates
 * generically (400, 401, 403, 404, 409, 429, 500) the product's declared title and detail were then
 * overwritten with that generic text — a registered 409 came back as "Conflict".
 *
 * The status fallback is for a type the catalog cannot resolve at all (`about:blank`, or an
 * unrecognised URI), which is the case it was written for.
 */
function translationCodeForProblem(problem: ProblemDetailsResponse): string {
  return registeredProblemCodeFromType(problem.type) ?? problemCodeForStatus(problem.status);
}

export function resolveProblemContentLanguage(problem: ProblemDetailsResponse, requestedLocale?: string): string {
  const titleKey = `errors.${translationCodeForProblem(problem)}.title`;
  const locale = normalizeLocale(requestedLocale) ?? defaultLocale;
  return Object.hasOwn(translations[locale], titleKey) ? locale : defaultLocale;
}

/** Localize the standard RFC members while preserving the problem type URI. */
export function localizeProblemDetails(problem: ProblemDetailsResponse, locale?: string): ProblemDetailsResponse {
  // Re-derived from the catalog rather than carried over from the inbound member, so a caller
  // cannot spoof a code by supplying one; `delete members.code` below is what enforces that.
  const customCode = registeredProblemCodeFromType(problem.type);
  const translationCode = translationCodeForProblem(problem);
  const titleKey = `errors.${translationCode}.title`;
  const detailKey = `errors.${translationCode}.detail`;
  const members: ProblemDetailsResponse = { ...problem };
  delete members.code;
  const translatedDetail = hasTranslationKey(detailKey) ? translate(detailKey, { locale }) : problem.detail;

  return {
    ...members,
    title: hasTranslationKey(titleKey) ? translate(titleKey, { locale }) : problem.title,
    ...(translatedDetail ? { detail: translatedDetail } : {}),
    ...(customCode ? { code: customCode } : {}),
    ...('errors' in problem ? { errors: localizeValidationIssues(problem.errors, locale) } : {}),
  };
}
