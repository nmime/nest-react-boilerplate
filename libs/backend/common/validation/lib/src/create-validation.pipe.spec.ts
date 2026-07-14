import { ArgumentMetadata, HttpStatus, ValidationPipe } from '@nestjs/common';
import { IsString } from 'class-validator';
import type { ValidationError as CVValidationError } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ClientDataValidationException, createValidationExceptionBody, createValidationPipe } from './index';

/**
 * Build a minimal ValidationError for testing.
 * class-validator's ValidationError doesn't include `detail` or `pointer` —
 * those are added by the pipe/transformer at runtime.
 */
function makeError(
  property: string,
  opts?: {
    constraints?: Record<string, string>;
    message?: string;
    children?: ReturnType<typeof makeError>[];
  },
): CVValidationError {
  return {
    property,
    constraints: opts?.constraints,
    children: opts?.children ?? [],
    target: null as any,
    value: undefined,
    ...(opts?.message && { message: opts.message }),
  };
}

describe('createValidationPipe', () => {
  it('creates a Nest validation pipe', () => {
    expect(createValidationPipe()).toBeInstanceOf(ValidationPipe);
  });

  it('creates problem details for validation errors', () => {
    expect(
      createValidationExceptionBody([
        makeError('name', {
          constraints: { isString: 'name must be a string' },
          message: 'name must be a string',
        }),
      ]),
    ).toEqual({
      type: 'urn:problem:nest-react-boilerplate:client-data-validation',
      title: 'Client data validation failed',
      status: 400,
      code: 'client-data-validation',
      detail: 'Request client data validation failed.',
      errors: [
        {
          property: 'name',
          constraints: { isString: 'name must be a string' },
          message: 'name must be a string',
          detail: 'name must be a string',
          pointer: '/name',
        },
      ],
    });
  });

  it('uses empty constraints when class-validator provides none', () => {
    expect(createValidationExceptionBody([makeError('nested')])).toMatchObject({
      errors: [{ property: 'nested', constraints: {}, pointer: '/nested' }],
    });
  });

  it('flattens nested validation errors', () => {
    expect(
      createValidationExceptionBody([
        makeError('profile', {
          children: [
            makeError('displayName', {
              constraints: { isString: 'displayName must be a string' },
              message: 'displayName must be a string',
            }),
            makeError('addresses', {
              children: [
                makeError('0', {
                  children: [
                    makeError('city', {
                      constraints: { isString: 'city must be a string' },
                      message: 'city must be a string',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ]),
    ).toMatchObject({
      errors: [
        {
          property: 'profile.displayName',
          constraints: { isString: 'displayName must be a string' },
          message: 'displayName must be a string',
          pointer: '/profile/displayName',
        },
        {
          property: 'profile.addresses.0.city',
          constraints: { isString: 'city must be a string' },
          message: 'city must be a string',
          pointer: '/profile/addresses/0/city',
        },
      ],
    });
  });

  it('escapes JSON Pointer path segments', () => {
    expect(
      createValidationExceptionBody([
        makeError('profile/primary', {
          children: [
            makeError('tilde~field', {
              constraints: { isString: 'tilde~field must be a string' },
            }),
          ],
        }),
      ]),
    ).toMatchObject({
      errors: [
        {
          property: 'profile/primary.tilde~field',
          pointer: '/profile~1primary/tilde~0field',
        },
      ],
    });
  });

  it('creates typed exceptions with static definition and info', () => {
    const exception = new ClientDataValidationException([
      {
        property: 'age',
        constraints: { isInt: 'age must be an integer number' },
        message: 'age must be an integer number',
        pointer: '/age',
      },
    ]);

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    const response = exception.getResponse();

    // Static fields from RFC 9457 definition
    expect(response.type).toBe('urn:problem:nest-react-boilerplate:client_data_validation');
    expect(response.title).toBe('Client Data Validation Failed');
    expect(response.detail).toBe('The provided data failed validation');
    expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    expect(response.code).toBe('client_data_validation');

    // Dynamic data is in `info`
    expect((response as Record<string, unknown>).info).toEqual({
      errors: [
        {
          property: 'age',
          constraints: { isInt: 'age must be an integer number' },
          message: 'age must be an integer number',
          pointer: '/age',
        },
      ],
    });
  });

  it('throws typed exceptions from the pipe exception factory', async () => {
    class CreateUserDto {
      @IsString()
      name!: string;
    }

    const pipe = createValidationPipe();
    const metadata: ArgumentMetadata = {
      data: undefined,
      metatype: CreateUserDto,
      type: 'body',
    };

    await expect(pipe.transform({ name: 123 }, metadata)).rejects.toBeInstanceOf(ClientDataValidationException);

    try {
      await pipe.transform({ name: 123 }, metadata);
    } catch (error) {
      const response = (error as ClientDataValidationException).getResponse();
      expect(response).toMatchObject({
        code: 'client_data_validation',
        status: HttpStatus.BAD_REQUEST,
        title: 'Client Data Validation Failed',
        type: 'urn:problem:nest-react-boilerplate:client_data_validation',
      });
      expect((response as Record<string, unknown>).info).toMatchObject({
        errors: [
          {
            constraints: { isString: 'name must be a string' },
            message: 'name must be a string',
            pointer: '/name',
            property: 'name',
          },
        ],
      });
    }
  });
});
