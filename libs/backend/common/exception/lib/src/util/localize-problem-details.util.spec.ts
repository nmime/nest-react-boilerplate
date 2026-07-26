// @requirements REQ-API-PROBLEM-001
import { describe, expect, it } from 'vitest';
import { localizeProblemDetails, resolveProblemContentLanguage } from './localize-problem-details.util';

describe('localizeProblemDetails', () => {
  it('localizes standard members and validation details without changing identity', () => {
    expect(
      localizeProblemDetails(
        {
          type: 'https://example.com/problems#client-data-validation',
          title: 'Client Data Validation Failed',
          status: 400,
          detail: 'One or more request members are invalid.',
          code: 'spoofed',
          errors: [{ detail: 'email must be an email address', pointer: '#/email' }],
        },
        'ru',
      ),
    ).toEqual({
      type: 'https://example.com/problems#client-data-validation',
      title: 'Ошибка валидации данных клиента',
      status: 400,
      detail: 'Одно или несколько полей запроса недействительны.',
      code: 'client-data-validation',
      errors: [{ detail: 'Поле email должно быть действительным email-адресом', pointer: '#/email' }],
    });
  });

  it('keeps malformed validation extensions intact and falls back for unknown translations', () => {
    expect(
      localizeProblemDetails(
        {
          type: 'https://errors.example.test/problems#teapot',
          title: 'Teapot',
          status: 418,
          detail: 'Stay calm.',
          errors: [
            null,
            { detail: 42, pointer: '#/count' },
            { detail: 'count must be a string', pointer: 42 },
            { detail: 'Untranslated validation message', pointer: '#/count' },
            { detail: 'value must be a string', pointer: 'count' },
          ],
        },
        'ru',
      ),
    ).toEqual({
      type: 'https://errors.example.test/problems#teapot',
      title: 'Teapot',
      status: 418,
      detail: 'Stay calm.',
      errors: [
        null,
        { detail: 42, pointer: '#/count' },
        { detail: 'count must be a string', pointer: 42 },
        { detail: 'Untranslated validation message', pointer: '#/count' },
        { detail: 'Поле value должно быть строкой', pointer: 'count' },
      ],
    });

    expect(
      localizeProblemDetails({
        type: 'https://errors.example.test/problems#teapot',
        title: 'Teapot',
        status: 418,
        errors: { detail: 'not-an-array' },
      }),
    ).toMatchObject({ errors: { detail: 'not-an-array' } });
  });

  it('keeps about:blank and strips an untrusted code extension', () => {
    expect(
      localizeProblemDetails({ type: 'about:blank', title: 'Bad Request', status: 400, code: 'spoofed' }, 'ru'),
    ).toEqual({
      type: 'about:blank',
      title: 'Некорректный запрос',
      status: 400,
      detail: 'Запрос не может быть обработан.',
    });
  });

  it('localizes registered authentication problems and reports the translated content language', () => {
    const problem = {
      type: 'https://example.com/problems#step-up-required',
      title: 'Step-up Authentication Required',
      status: 403,
      detail: 'Recent authentication is required to perform this security-sensitive action.',
    };

    expect(localizeProblemDetails(problem, 'ru')).toMatchObject({
      code: 'step-up-required',
      title: 'Требуется повторная аутентификация',
      detail: 'Войдите снова перед выполнением этого действия, связанного с безопасностью.',
    });
    expect(resolveProblemContentLanguage(problem, 'ru')).toBe('ru');
  });

  it('reports the fallback language when the requested locale has no translation', () => {
    const problem = { type: 'about:blank', title: 'Service Unavailable', status: 503 };
    expect(resolveProblemContentLanguage(problem, 'ru')).toBe('en');
    expect(resolveProblemContentLanguage({ ...problem, status: 400 }, 'ru')).toBe('ru');
    expect(resolveProblemContentLanguage({ ...problem, status: 400 }, 'fr')).toBe('en');
  });
});
