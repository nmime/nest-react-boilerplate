import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { localizeProblemDetails } from './localize-problem-details.util';

describe('localizeProblemDetails', () => {
  it('localizes validation issues and preserves unmapped problem fields', () => {
    expect(
      localizeProblemDetails(
        {
          type: 'about:blank',
          title: 'Bad Request',
          status: HttpStatus.BAD_REQUEST,
          errors: [
            {
              property: 'email',
              detail: 'email must be an email address',
              message: 'email must be an email address',
              constraints: {
                isEmail: 'email must be an email address',
                custom: 'custom',
              },
            },
            { constraints: { minLength: 'short' } },
            'plain',
          ],
        },
        'ru',
      ),
    ).toMatchObject({
      code: 'bad-request',
      errors: [
        {
          property: 'email',
          constraints: {
            isEmail: 'Поле email должно быть действительным email-адресом',
            custom: 'custom',
          },
          detail: 'Поле email должно быть действительным email-адресом',
          message: 'Поле email должно быть действительным email-адресом',
        },
        { constraints: { minLength: 'Поле value слишком короткое' } },
        'plain',
      ],
      type: 'https://example.com/problems/bad-request',
    });
    expect(
      localizeProblemDetails({
        type: 'urn:custom',
        title: 'Custom',
        status: 499,
        code: 'unmapped',
        detail: 'No translation',
        errors: 'raw',
      }),
    ).toEqual({
      type: 'urn:custom',
      title: 'Custom',
      status: 499,
      code: 'unmapped',
      detail: 'No translation',
      errors: 'raw',
    });
  });

  it('leaves validation text untouched when it matches no constraint template', () => {
    expect(
      localizeProblemDetails(
        {
          type: 'about:blank',
          title: 'Bad Request',
          status: HttpStatus.BAD_REQUEST,
          errors: [
            {
              property: 'custom',
              message: 'totally-unmatched-validation-message',
              detail: 'another-unmatched-message',
              constraints: {
                unknownRule: 'totally-unmatched-validation-message',
              },
            },
          ],
        },
        'ru',
      ),
    ).toMatchObject({
      errors: [
        {
          property: 'custom',
          message: 'totally-unmatched-validation-message',
          detail: 'another-unmatched-message',
          constraints: { unknownRule: 'totally-unmatched-validation-message' },
        },
      ],
    });
  });
});
