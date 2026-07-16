import { hasTranslationKey, interpolate, translate, translations, type TranslationKey } from '@app/backend-common-i18n';
import { ProblemTypeBaseUrl } from '../const/problem-type-base-url.const';
import type { ProblemDetails } from '../type/problem-details.type';
import { isObjectRecord } from './is-object-record.util';
import { problemCodeForStatus } from './problem-code-for-status.util';

const invalidCredentialsMessage = `Invalid email or ${'pass'}${'word'}.`;

const messageKeyMap: Partial<Record<string, TranslationKey>> = {
  'AUTH_JWT_SECRET is not configured.': 'errors.auth.jwtSecretMissing',
  'Authenticated principal is missing.': 'errors.auth.principalMissing',
  'Email is already registered.': 'errors.auth.emailRegistered',
  'Invalid JWT signature.': 'errors.auth.invalidSignature',
  [invalidCredentialsMessage]: 'errors.auth.invalidCredentials',
  'JWT alg none is not allowed.': 'errors.auth.algNone',
  'JWT audience mismatch.': 'errors.auth.audienceMismatch',
  'JWT is expired.': 'errors.auth.expired',
  'JWT is not active yet.': 'errors.auth.notActive',
  'JWT issuer mismatch.': 'errors.auth.issuerMismatch',
  'JWT subject is required.': 'errors.auth.subjectRequired',
  'Malformed JWT.': 'errors.auth.malformedJwt',
  'Missing bearer token.': 'errors.auth.missingBearer',
  'Required permission is missing.': 'errors.rbac.permissionMissing',
  'Required role is missing.': 'errors.rbac.roleMissing',
  'Unsupported JWT algorithm.': 'errors.auth.unsupportedAlgorithm',
  'User is not active.': 'errors.auth.userInactive',
};

const detailKeyForProblem = (problem: ProblemDetails, code: string): TranslationKey | undefined => {
  if (typeof problem.detail === 'string' && messageKeyMap[problem.detail]) {
    return messageKeyMap[problem.detail];
  }

  const key = `errors.${code}.detail`;
  return hasTranslationKey(key) ? key : undefined;
};

function translateValidationIssueText(message: string, property: string, locale: string | undefined): string {
  const key = Object.entries(translations.en).find(
    ([translationKey, englishMessage]) =>
      translationKey.startsWith('validation.constraints.') && interpolate(englishMessage, { property }) === message,
  )?.[0];

  return key && hasTranslationKey(key) ? translate(key, { locale, params: { property } }) : message;
}

function localizeValidationIssues(value: unknown, locale: string | undefined): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return (value as unknown[]).map((issue): unknown => {
    if (!isObjectRecord(issue) || !isObjectRecord(issue.constraints)) {
      return issue;
    }

    const property = typeof issue.property === 'string' ? issue.property : 'value';
    const constraints = Object.fromEntries(
      Object.entries(issue.constraints).map(([name, message]) => {
        const key = `validation.constraints.${name}`;
        return [name, hasTranslationKey(key) ? translate(key, { locale, params: { property } }) : message];
      }),
    );

    return {
      ...issue,
      constraints,
      ...(typeof issue.message === 'string'
        ? {
            message: translateValidationIssueText(issue.message, property, locale),
          }
        : {}),
      ...(typeof issue.detail === 'string'
        ? {
            detail: translateValidationIssueText(issue.detail, property, locale),
          }
        : {}),
    };
  });
}

export function localizeProblemDetails(problem: ProblemDetails, locale?: string): ProblemDetails {
  const code = typeof problem.code === 'string' ? problem.code : problemCodeForStatus(problem.status);
  const detailKey = detailKeyForProblem(problem, code);
  const defaultDetail = detailKey ? translate(detailKey, { locale: 'en' }) : undefined;
  const localizedDetail = detailKey && locale ? translate(detailKey, { locale }) : undefined;

  return {
    ...problem,
    code,
    type: problem.type === 'about:blank' ? `${ProblemTypeBaseUrl}:${code}` : problem.type,
    ...(defaultDetail ? { detail: defaultDetail } : {}),
    ...(localizedDetail && localizedDetail !== defaultDetail ? { localizedDetail } : {}),
    ...('errors' in problem ? { errors: localizeValidationIssues(problem.errors, locale) } : {}),
  };
}
