import { applyDecorators, UsePipes } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { problemTypeForCode, type OpenApiSchemaObject } from '@app/backend-common-exception';
import { createValidationPipe } from '../create-validation.pipe';

const validationProblemSchema: OpenApiSchemaObject = {
  type: 'object',
  required: ['type', 'title', 'status', 'detail', 'code', 'errors'],
  properties: {
    type: {
      type: 'string',
      format: 'uri-reference',
      enum: [problemTypeForCode('client-data-validation')],
      example: problemTypeForCode('client-data-validation'),
    },
    title: { type: 'string', example: 'Client Data Validation Failed' },
    status: { type: 'integer', minimum: 400, maximum: 400, enum: [400], example: 400 },
    detail: { type: 'string', example: 'One or more request members are invalid.' },
    instance: { type: 'string', format: 'uri-reference' },
    code: { type: 'string', enum: ['client-data-validation'], example: 'client-data-validation' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        required: ['detail', 'pointer'],
        properties: {
          detail: { type: 'string', example: 'email must be an email address' },
          pointer: { type: 'string', format: 'uri-reference', example: '#/email' },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: true,
};

export const ApiValidation = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    UsePipes(createValidationPipe()),
    ApiResponse({
      status: 400,
      description: 'Client Data Validation Failed',
      content: { 'application/problem+json': { schema: validationProblemSchema } },
    }),
  );
