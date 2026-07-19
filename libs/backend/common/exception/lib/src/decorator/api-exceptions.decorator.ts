import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { getProblemTypeDefinition, type ProblemTypeCode } from '@app/common-problem-details';
import { mapHttpStatusToProblemTitle } from '../util/map-http-status-to-problem-title.util';
import { getProblemDetailsSchema, getRegisteredProblemDetailsSchema } from '../util/problem-details-schema.util';

type ApiExceptionStatusInput = number | readonly number[];

function isStatusArray(status: ApiExceptionStatusInput): status is readonly number[] {
  return Array.isArray(status);
}

function normalizeApiExceptionStatuses(statuses: readonly ApiExceptionStatusInput[]): number[] {
  const normalized: number[] = [];

  for (const status of statuses) {
    if (isStatusArray(status)) {
      normalized.push(...status);
    } else {
      normalized.push(status);
    }
  }

  return normalized;
}

export function ApiExceptions(...statuses: ApiExceptionStatusInput[]): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...normalizeApiExceptionStatuses(statuses).map((status) =>
      ApiResponse({
        status,
        description: mapHttpStatusToProblemTitle(status),
        content: {
          'application/problem+json': {
            schema: getProblemDetailsSchema(status),
          },
        },
      }),
    ),
  );
}

export function ApiProblemTypes(...codes: ProblemTypeCode[]): MethodDecorator & ClassDecorator {
  const codesByStatus = new Map<number, ProblemTypeCode[]>();

  for (const code of codes) {
    const definition = getProblemTypeDefinition(code);
    if (!definition) {
      throw new TypeError(`Unknown registered problem type: ${JSON.stringify(code)}`);
    }
    codesByStatus.set(definition.status, [...(codesByStatus.get(definition.status) ?? []), code]);
  }

  return applyDecorators(
    ...[...codesByStatus].map(([status, statusCodes]) => {
      const schemas = statusCodes.map(getRegisteredProblemDetailsSchema);
      const descriptions = statusCodes.map((code) => getProblemTypeDefinition(code)?.title).filter(Boolean);

      return ApiResponse({
        status,
        description: descriptions.join(' or '),
        content: {
          'application/problem+json': {
            schema: schemas.length === 1 ? schemas[0] : { oneOf: schemas },
          },
        },
      });
    }),
  );
}
