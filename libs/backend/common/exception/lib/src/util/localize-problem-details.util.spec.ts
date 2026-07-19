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

  it('reports the fallback language when the requested locale has no translation', () => {
    const problem = { type: 'about:blank', title: 'Service Unavailable', status: 503 };
    expect(resolveProblemContentLanguage(problem, 'ru')).toBe('en');
    expect(resolveProblemContentLanguage({ ...problem, status: 400 }, 'ru')).toBe('ru');
    expect(resolveProblemContentLanguage({ ...problem, status: 400 }, 'fr')).toBe('en');
  });
});
