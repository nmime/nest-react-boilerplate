import { applyDecorators } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import { mapHttpStatusToProblemTitle } from "../util/map-http-status-to-problem-title.util";
import { getProblemDetailsSchema } from "../util/problem-details-schema.util";

type ApiExceptionStatusInput = number | readonly number[];

function isStatusArray(
  status: ApiExceptionStatusInput,
): status is readonly number[] {
  return Array.isArray(status);
}

function normalizeApiExceptionStatuses(
  statuses: readonly ApiExceptionStatusInput[],
): number[] {
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

export function ApiExceptions(
  ...statuses: ApiExceptionStatusInput[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...normalizeApiExceptionStatuses(statuses).map((status) =>
      ApiResponse({
        status,
        description: mapHttpStatusToProblemTitle(status),
        content: {
          "application/problem+json": {
            schema: getProblemDetailsSchema(status),
          },
        },
      }),
    ),
  );
}
