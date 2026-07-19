import { problemCodeFromType } from '@app/common-problem-details';
import { translate } from '@app/frontend-i18n-shared';
import { getApiLocale } from './api-locale';

export type NormalizedApiErrorKind = 'auth' | 'client' | 'network' | 'server' | 'unknown' | 'validation';

export interface NormalizedValidationIssue {
  field?: string;
  message: string;
}

export interface NormalizedApiError {
  body?: unknown;
  code: string;
  detail?: string;
  endpoint?: string;
  id: string;
  kind: NormalizedApiErrorKind;
  message: string;
  method?: string;
  status: number | null;
  type?: string;
  validation: NormalizedValidationIssue[];
}

export interface NormalizeApiErrorInput {
  body?: unknown;
  endpoint?: string;
  error?: unknown;
  method?: string;
  response?: Pick<Response, 'status' | 'statusText'>;
}

export const FrontendErrorKey = '_frontendError';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const stringFrom = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const validationFromArray = (items: unknown[]): NormalizedValidationIssue[] =>
  items.flatMap((item) => {
    if (typeof item === 'string') {
      return [{ message: item }];
    }

    if (!isRecord(item)) {
      return [];
    }

    const message = stringFrom(item['message']) ?? stringFrom(item['detail']) ?? stringFrom(item['error']);

    if (!message) {
      return [];
    }

    return [
      {
        field: fieldFromPointer(item['pointer']) ?? stringFrom(item['field']) ?? stringFrom(item['property']),
        message,
      },
    ];
  });

export const extractValidation = (body: unknown): NormalizedValidationIssue[] => {
  if (!isRecord(body)) {
    return [];
  }

  const errors = body['errors'];
  if (Array.isArray(errors)) {
    return validationFromArray(errors);
  }

  if (isRecord(errors)) {
    return Object.entries(errors).flatMap(([field, value]) => {
      if (Array.isArray(value)) {
        return value
          .map(stringFrom)
          .filter((message): message is string => Boolean(message))
          .map((message) => ({ field, message }));
      }

      const message = stringFrom(value);
      return message ? [{ field, message }] : [];
    });
  }

  return [];
};

const statusKind = (status: number | null, body: unknown): NormalizedApiErrorKind => {
  if (status === null) {
    return 'network';
  }

  if (status === 401 || status === 403) {
    return 'auth';
  }

  if ((status === 400 || status === 422) && extractValidation(body).length > 0) {
    return 'validation';
  }

  if (status >= 500) {
    return 'server';
  }

  if (status >= 400) {
    return 'client';
  }

  return 'unknown';
};

const extractCode = (status: number | null, body: unknown, fallbackKind: NormalizedApiErrorKind): string => {
  if (isRecord(body)) {
    const type = stringFrom(body['type']);
    const registeredCode = problemCodeFromType(type);
    if (registeredCode) {
      return registeredCode;
    }

    const code = stringFrom(body['code']) ?? stringFrom(body['errorCode']) ?? stringFrom(body['name']);

    if (code) {
      return code;
    }

    if (type && type !== 'about:blank') {
      return type;
    }
  }

  if (status === null) {
    /* v8 ignore next -- statusKind() always yields "network" for a null status, so fallbackKind is never non-network here; the "network.error" arm is unreachable */
    return fallbackKind === 'network' ? 'network.offline' : 'network.error';
  }

  return `http.${status}`;
};

const extractMessage = (status: number | null, body: unknown): string => {
  if (isRecord(body)) {
    const message =
      stringFrom(body['detail']) ??
      stringFrom(body['message']) ??
      stringFrom(body['title']) ??
      stringFrom(body['error']);

    if (message) {
      return message;
    }
  }

  if (status === null) {
    return translate('errors.api.networkFailed', { locale: getApiLocale() });
  }

  return translate('errors.api.requestFailed', {
    locale: getApiLocale(),
    params: { status },
  });
};

export const normalizeApiError = ({ body, endpoint, method, response }: NormalizeApiErrorInput): NormalizedApiError => {
  const status = response?.status ?? null;
  const kind = statusKind(status, body);
  const code = extractCode(status, body, kind);
  const message = extractMessage(status, body);
  const normalizedMethod = method?.toUpperCase();
  const type = isRecord(body) ? stringFrom(body['type']) : undefined;
  const id = [normalizedMethod, endpoint, status ?? 'network', code].filter(Boolean).join(':');

  return {
    body,
    code,
    detail: isRecord(body) ? stringFrom(body['detail']) : undefined,
    endpoint,
    id,
    kind,
    message,
    method: normalizedMethod,
    status,
    type,
    validation: extractValidation(body),
  };
};

export const isNetworkFailure = (error: unknown): boolean =>
  error instanceof TypeError ||
  (error instanceof Error && /network|fetch|offline|failed to fetch/iu.test(error.message));

export const readJsonBody = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().includes('json')) {
    return undefined;
  }

  return response
    .clone()
    .json()
    .catch(() => undefined);
};

export const enrichJsonResponse = async (response: Response, error: NormalizedApiError): Promise<Response> => {
  const body = await readJsonBody(response);
  const enrichedBody = isRecord(body) ? { ...body, [FrontendErrorKey]: error } : { [FrontendErrorKey]: error };
  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json');

  return new Response(JSON.stringify(enrichedBody), {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};
const fieldFromPointer = (value: unknown): string | undefined => {
  const pointer = stringFrom(value);
  if (!pointer?.startsWith('#/')) {
    return undefined;
  }

  return pointer
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/gu, '/').replace(/~0/gu, '~'))
    .join('.');
};
