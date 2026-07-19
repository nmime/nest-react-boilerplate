import { problemCodeFromType } from '@app/common-problem-details';
import {
  fallbackLocale,
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

  return key && hasTranslationKey(key) ? translate(key, { locale, params: { property } }) : detail;
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

function translationCodeForProblem(problem: ProblemDetailsResponse): string {
  return problemCodeFromType(problem.type) ?? problemCodeForStatus(problem.status);
}

export function resolveProblemContentLanguage(problem: ProblemDetailsResponse, requestedLocale?: string): string {
  const titleKey = `errors.${translationCodeForProblem(problem)}.title`;
  const locale = normalizeLocale(requestedLocale) ?? fallbackLocale;
  return Object.hasOwn(translations[locale], titleKey) ? locale : fallbackLocale;
}

/** Localize the standard RFC members while preserving the problem type URI. */
export function localizeProblemDetails(problem: ProblemDetailsResponse, locale?: string): ProblemDetailsResponse {
  const customCode = problemCodeFromType(problem.type);
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
